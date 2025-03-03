import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createTransactionExtension, Transaction } from '../src';

const prisma = new PrismaClient().$extends(createTransactionExtension());

@Injectable()
class UserRepository {
  @Transaction()
  async createUserError(email: string, name: string) {
    await prisma.user.create({
      data: { email, name },
    });
    throw new Error('Rollback');
  }

  @Transaction()
  async createUser(email: string, name: string) {
    const newUser = prisma.user.create({
      data: { email, name },
    });
    const newUser2 = prisma.user.create({
      data: { email: email + 't', name },
    });
    const [_newUser, _newUser2] = await Promise.all([newUser, newUser2]);
    return {
      name: _newUser.name,
      email: _newUser.email,
    };
  }

  @Transaction()
  async rawQuery(email: string, name: string) {
    return prisma.$executeRaw`INSERT INTO "User" (name, email) VALUES (${name}, ${email})`;
  }

  @Transaction()
  async rawQueryError(email: string, name: string) {
    await prisma.$executeRaw`INSERT INTO "User" (name, email) VALUES (${name}, ${email})`;
    throw new Error('Rollback');
  }

  @Transaction({ timeout: 500 })
  async createUserWithTimeout(email: string, name: string) {
    // Loop
    for (let i = 0; i < 3000; i++) {
      await prisma.user.create({
        data: { email: email + i, name },
      });
      await new Promise((res) => setTimeout(res, 1000));
    }
    return true;
  }
}

@Module({
  providers: [UserRepository],
})
class AppModule {}

describe('Transaction Integration Tests', () => {
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

  describe('Successful Transactions', () => {
    it('should successfully create a user with transaction decorator', async () => {
      const email = 'tx@test.com';
      const name = 'tx';
      const result = repository.createUser(email, name);

      await expect(result).resolves.toEqual({
        email,
        name,
      });
    });

    it('should successfully execute raw SQL query within transaction', async () => {
      const email = 'raw@test.com';
      const name = 'raw';
      const result = repository.rawQuery(email, name);
      await expect(result).resolves.toBeDefined();
      const user = await prisma.user.findFirst({
        where: { email },
      });
      expect(user).toMatchObject({ email, name });
    });
  });

  describe('Transaction Rollbacks', () => {
    it('should rollback raw query transaction on error', async () => {
      const email = 'rollback-raw@test.com';
      const name = 'rollback-raw';
      const operation = repository.rawQueryError(email, name);
      await expect(operation).rejects.toThrow('Rollback');

      const user = await prisma.user.findFirst({
        where: { email },
      });
      expect(user).toBeNull();
    });

    it('should rollback decorated transaction on error', async () => {
      const email = 'rollback@test.com';
      const name = 'rollback';

      const operation = repository.createUserError(email, name);
      await expect(operation).rejects.toThrow('Rollback');

      const user = await prisma.user.findFirst({
        where: { email },
      });
      expect(user).toBeNull();
    });

    it('should fail when transaction timeout is exceeded', async () => {
      const email = 'timeout@test.com';
      const name = 'timeout';
      const operation = repository.createUserWithTimeout(email, name);
      await expect(operation).rejects.toThrow(/timeout/i);

      // Verify no user was created
      const user = await prisma.user.findFirst({
        where: { email },
      });
      expect(user).toBeNull();
    });
  });
});
