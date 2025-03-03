import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { createTransactionExtension, Transaction } from '../src';
import { delay } from './util';

const prisma = new PrismaClient().$extends(createTransactionExtension());

@Injectable()
class UserRepository {
  @Transaction()
  async lazyCreateUser(email: string, name: string, cb?: () => void) {
    const user = await prisma.user.create({
      data: { email, name },
    });
    cb && (await cb());
    return user;
  }

  @Transaction({ isolationLevel: Prisma.TransactionIsolationLevel.ReadUncommitted })
  async findUsersReadUncommitted(email: string) {
    const users = await prisma.user.findMany();
    return users.some((user) => user.email === email);
  }

  @Transaction({ isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
  async findUsersReadCommitted(email: string) {
    const users = await prisma.user.findMany();
    return users.some((user) => user.email === email);
  }

  @Transaction({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  async findUsersRepeatableRead(email: string, updatedName: string) {
    const firstRead = await prisma.user.findFirst({ where: { email } });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        data: { name: updatedName },
        where: { email },
      });
    });

    const secondRead = await prisma.user.findFirst({ where: { email } });

    return firstRead?.name === secondRead?.name;
  }

  @Transaction({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  async findAndUpdateSerializable(id: number, updatedName: string) {
    const user = await prisma.user.findFirst({
      where: { id },
    });

    if (user) {
      await prisma.user.update({
        where: { id },
        data: { name: updatedName },
      });
    }

    return user;
  }
}

@Module({
  providers: [UserRepository],
})
class AppModule {}

describe('Transaction Isolation Tests', () => {
  let module: TestingModule;
  let repository: UserRepository;

  beforeAll(async () => {
    await prisma.user.deleteMany();
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await module.init();
    repository = module.get(UserRepository);
  });

  describe('ReadUncommitted', () => {
    const email = 'dirty@test.com';
    const name = 'dirty';
    if (process.env.DATABASE_URL?.startsWith('postgresql')) {
      it('Postgre operates as ReadCommitted by default', async () => {
        await expect(repository.findUsersReadCommitted(email)).resolves.toBeFalsy();
      });
    } else {
      it('should see uncommitted changes (dirty reads)', async () => {
        // Start a transaction that will create a user but won't commit
        repository.lazyCreateUser(email, name, async () => await delay(1000));
        await expect(repository.findUsersReadUncommitted('dirty@test.com')).resolves.toBeTruthy();
      });
    }
  });

  describe('ReadCommitted', () => {
    it('should only see committed changes', async () => {
      await expect(repository.findUsersReadCommitted('committed@test.com')).resolves.toBeFalsy();
    });
  });

  describe('RepeatableRead', () => {
    it('should prevent Non-Repeatable Reads', async () => {
      const email = 'repeatable@test.com';
      const name = 'repeatable';
      const updatedName = name + 'updated';

      await repository.lazyCreateUser(email, name);

      await expect(repository.findUsersRepeatableRead(email, updatedName)).resolves.toBeTruthy();

      await expect(prisma.user.findFirst({ where: { email } })).resolves.toMatchObject({
        name: updatedName,
        email,
      });
    });
  });

  describe('Serializable', () => {
    it('should prevent concurrent modifications and maintain consistency', async () => {
      const email = 'serial@test.com';
      const name = 'initial';
      const updatedName = 'initial_updated';

      const testUser = await repository.lazyCreateUser(email, name);

      // Executing two transactions simultaneously on the same data
      const transaction1 = repository.findAndUpdateSerializable(testUser.id, updatedName);
      const transaction2 = repository.findAndUpdateSerializable(testUser.id, updatedName);

      // Execute two transactions
      const results = await Promise.allSettled([transaction1, transaction2]);

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.filter((r) => r.status === 'rejected').length;

      // Only one transaction must succeed
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);

      // Check results
      const finalUser = await prisma.user.findFirst({
        where: { id: testUser.id },
      });

      expect(finalUser.name).toBe(updatedName);
    });
  });
});
