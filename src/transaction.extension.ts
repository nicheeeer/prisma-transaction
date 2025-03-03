import { Prisma } from '@prisma/client';
import { TransactionOptions } from './transaction.decorator';
import { extractTransaction } from './utils';
import transactionStorage from './utils/transaction.storage';

export const createTransactionExtension = (options?: TransactionOptions) =>
  Prisma.defineExtension((prisma) => {
    return prisma.$extends({
      query: {
        $allOperations: async ({ args, model, operation, query, __internalParams }: any) => {
          const store = transactionStorage.getTx();

          if (store === null || __internalParams?.transaction) {
            return query(args);
          }

          if (store.manualTx === null) {
            const manualTx = await extractTransaction(prisma, store.options || options);
            if (store.manualTx === null) {
              store.manualTx = manualTx;
            }
          }

          if (model) {
            const result = await store.manualTx.client[model][operation](args);

            return result;
          }

          return (store.manualTx as any).client[operation](args);
        },
      },
    });
  });
