# @nicheeeer/prisma-transaction

## Introduction
`prisma-transaction` is a library that provides a simple way to use transactions in Prisma within NestJS using decorators. 
\
It simplifies handling transactions and ensures consistency across services by utilizing `AsyncLocalStorage` to manage transactions within Prisma extensions.

## Installation

```sh
npm install @nicheeeer/prisma-transaction
```

or

```sh
yarn add @nicheeeer/prisma-transaction
```


## Usage

### 1️⃣ Extend prisma client

This library extends Prisma using its extension feature

```typescript
import { createTransactionExtension } from '@nicheeeer/prisma-transaction';

const prisma = new PrismaClient().$extends(createTransactionExtension());
```

### 2️⃣ Use the `@Transaction` Decorator

Apply the `@Transaction` decorator to a method where you want to execute a transaction:

```typescript
import { Injectable } from '@nestjs/common';
import { Transaction } from '@nicheeeer/prisma-transaction';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  @Transaction()
  async createUser(userData: { name: string; email: string }) {
    return this.prisma.user.create({
      data: userData,
    });
  }
}
```


## Transaction Options
The @Transaction decorator supports the following options:

```typescript
export interface TransactionOptions {
  /**
   * The maximum amount of time Prisma Client will wait to acquire a transaction from the database. The default value is 2 seconds.
   */
  maxWait?: number;
  
  /**
   * The maximum amount of time the interactive transaction can run before being canceled and rolled back. The default value is 5 seconds.
   */
  timeout?: number;
  
  /**
   * By default this is set to the value currently configured in your database.
   */
  isolationLevel?: Prisma.TransactionIsolationLevel;
}
```
You can specify transaction options when using the `@Transaction` decorator:

```typescript
@Transaction({ isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3000, timeout: 10000 })
async updateUser(email: string) {
  return prisma.user.findFirst({
    where: { email } 
  });
}
```

The `createTransactionExtension` function also supports transaction options
```typescript
import { PrismaClient } from '@prisma/client';
import { createTransactionExtension } from '@nicheeeer/prisma-transaction';

const prisma = new PrismaClient().$extends(createTransactionExtension({ isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3000, timeout: 10000 }));
```

## License
MIT License

