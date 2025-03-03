import { Prisma } from '@prisma/client';

type Commit = () => void;
type Rollback = (error: any) => void;

export class ManualTransaction {
  private _commit?: Commit;
  private _rollback?: Rollback;
  private _waiter?: Promise<void>;

  constructor(private readonly transaction: Prisma.TransactionClient) {}

  public get client(): Prisma.TransactionClient {
    return this.transaction;
  }

  public setTransaction(commit: Commit, rollback: Rollback) {
    this._commit = commit;
    this._rollback = rollback;
  }

  public async commit(): Promise<void> {
    if (!this._commit || typeof this._commit !== 'function')
      throw Error('Transaction commit not set');

    this._commit();
    await this._waiter;
  }

  public async rollback(error: any): Promise<void> {
    if (!this._rollback || typeof this._rollback !== 'function')
      throw Error('Transaction rollback not set');

    this._rollback(error);
    await this._waiter;
  }

  public async setWaiter(waiter) {
    this._waiter = waiter;
  }
}
