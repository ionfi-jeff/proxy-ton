import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { ops } from '../utils/ops';

export type ProxyTonWalletConfig = {};

export function proxyTonWalletConfigToCell(config: ProxyTonWalletConfig): Cell {
    return beginCell().endCell();
}

export function externalTransfer(params: {
    queryId: bigint;
    amount: bigint;
    responseAddress?: Address | null;
    forwardAmount?: bigint;
    forwardPayload?: Cell;
}) {
    return beginCell()
        .storeUint(ops.external_transfer, 32)
        .storeUint(params.queryId, 64)
        .storeCoins(params.amount)
        .storeAddress(params.responseAddress ?? null)
        .storeCoins(params.forwardAmount ?? 0n)
        .storeMaybeRef(params.forwardPayload ?? null)
        .endCell();
}

export class ProxyTonWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new ProxyTonWallet(address);
    }

    static createFromConfig(config: ProxyTonWalletConfig, code: Cell, workchain = 0) {
        const data = proxyTonWalletConfigToCell(config);
        const init = { code, data };
        return new ProxyTonWallet(contractAddress(workchain, init), init);
    }

    static transferMessage(
        jetton_amount: bigint,
        to: Address,
        responseAddress: Address,
        customPayload: Cell,
        forward_ton_amount: bigint,
        forwardPayload: Cell,
    ) {
        return beginCell()
            .storeUint(ops.transfer, 32)
            .storeUint(0, 64)
            .storeCoins(jetton_amount)
            .storeAddress(to)
            .storeAddress(responseAddress)
            .storeMaybeRef(customPayload)
            .storeCoins(forward_ton_amount)
            .storeMaybeRef(forwardPayload)
            .endCell();
    }

    async getJettonBalance(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        let res = await provider.get('get_wallet_data', []);
        return res.stack.readBigNumber();
    }

    // proxy ton Transfer
    // If amount is less than msg_value, then it will send msg_value
    // If amount is more than msg_value, then it will send amount + fees
    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: {
            jetton_amount: bigint;
            to: Address;
            response_address: Address;
            custom_payload: Cell;
            forward_ton_amount: bigint;
            forward_payload: Cell;
        },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: ProxyTonWallet.transferMessage(
                params.jetton_amount,
                params.to,
                params.response_address,
                params.custom_payload,
                params.forward_ton_amount,
                params.forward_payload,
            ),
            value: value,
        });
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
