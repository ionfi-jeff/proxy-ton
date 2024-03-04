import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { ops } from '../utils/ops';

export type ProxyTonMinterConfig = {
    content: Cell;
    walletCode: Cell;
};

export function proxyTonMinterConfigToCell(config: ProxyTonMinterConfig): Cell {
    return beginCell().storeRef(config.content).storeRef(config.walletCode).endCell();
}

export class ProxyTonMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new ProxyTonMinter(address);
    }

    static createFromConfig(config: ProxyTonMinterConfig, code: Cell, workchain = 0) {
        const data = proxyTonMinterConfigToCell(config);
        const init = { code, data };
        return new ProxyTonMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: {
            to: Address;
        },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(ops.mint, 32).storeUint(0, 64).storeAddress(params.to).endCell(),
            value: value,
        });
    }

    async getWalletAddress(provider: ContractProvider, owner: Address) {
        const { stack } = await provider.get('get_wallet_address', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(owner).endCell(),
            },
        ]);

        return stack.readAddress();
    }
}
