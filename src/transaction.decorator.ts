import '@nestjs/common';
import { Prisma } from '@prisma/client';
import { copyMethodMetadata } from './utils';
import transactionStorage from './utils/transaction.storage';

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

export function Transaction(options?: TransactionOptions): MethodDecorator {
  return ((
    _: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: any) => Promise<any>>,
  ) => {
    const originalFn = descriptor.value;
    if (typeof originalFn !== 'function') {
      throw new Error(
        `The @Transaction decorator can be only used on functions, but ${propertyKey.toString()} is not a function.`,
      );
    }

    descriptor.value = async function (this: any, ...args: any[]) {
      const outerThis = this;
      return transactionStorage.initTx(options, async function () {
        try {
          const result = await originalFn.apply(outerThis, args);

          const store = transactionStorage.getTx();

          if (store?.manualTx) {
            await store.manualTx.commit();
          }

          return result;
        } catch (error) {
          const store = transactionStorage.getTx();

          if (store?.manualTx) {
            await store.manualTx.rollback(error);
          }

          throw error;
        }
      });
    };

    copyMethodMetadata(originalFn, descriptor.value);
  }) as MethodDecorator;
}
