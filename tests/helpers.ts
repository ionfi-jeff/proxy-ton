import { BlockchainTransaction } from '@ton/sandbox';
import { flattenTransaction } from '@ton/test-utils';

export const findTx = (transactions: BlockchainTransaction[], op: number) => {
    const tx = transactions.map(flattenTransaction).find((tx) => {
        return tx.op === op;
    });

    if (!tx) {
        throw new Error(`Transaction with op ${op} not found`);
    }

    return tx;
};
