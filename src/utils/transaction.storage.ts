import { AsyncLocalStorage } from 'async_hooks';
import { ManualTransaction } from './manual-transaction';
import { TransactionOptions } from '../transaction.decorator';

type TransactionStorageDataType = { manualTx: ManualTransaction; options: TransactionOptions };

class LocalStorage<T> {
  private readonly als: AsyncLocalStorage<T>;
  constructor() {
    this.als = new AsyncLocalStorage();

    if (!this.als) {
      throw new Error(
        `Cannot create transaction storage because no AsyncLocalStorage from async_hooks.`,
      );
    }
  }

  protected run<R = any>(store: T, callback: () => R): R {
    return this.als.run(store, callback);
  }

  protected get(): T {
    return this.als.getStore() ?? null;
  }

  protected set(key: keyof T, value: any): void {
    const store = this.get();
    if (store !== null) store[key] = value;
  }
}

class TransactionStorage extends LocalStorage<TransactionStorageDataType> {
  initTx(options: TransactionOptions, callback: () => Promise<void>) {
    return this.run({ manualTx: null, options }, callback);
  }

  getTx(): TransactionStorageDataType {
    return this.get() || null;
  }

  setTx(value: ManualTransaction): void {
    const store = this.get();
    if (store !== null) store.manualTx = value;
    throw new Error('TransactionStorage is not initialized.');
  }
}

export default new TransactionStorage();
