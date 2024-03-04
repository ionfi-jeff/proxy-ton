import '@ton/test-utils';
import '../utils/matchers';
import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { flattenTransaction } from '@ton/test-utils';
import { ProxyTonMinter, ProxyTonMinterConfig } from '../wrappers/ProxyTonMinter';
import { ProxyTonWallet } from '../wrappers/ProxyTonWallet';
import { ops } from '../utils/ops';

describe('ProxyTonWallet', () => {
    let blockchain: Blockchain;
    let proxyTonMinter: SandboxContract<ProxyTonMinter>;
    let adminProxyTonWallet: SandboxContract<ProxyTonWallet>;
    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        const proxyTonWalletCode = await compile('ProxyTonWallet');
        const proxyTonMinterCode = await compile('ProxyTonMinter');
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin');
        user = await blockchain.treasury('user');

        const config: ProxyTonMinterConfig = {
            content: Cell.EMPTY,
            walletCode: proxyTonWalletCode,
        };

        proxyTonMinter = blockchain.openContract(ProxyTonMinter.createFromConfig(config, proxyTonMinterCode));
        await proxyTonMinter.sendDeploy(admin.getSender(), toNano('0.05'));
        await proxyTonMinter.sendMint(admin.getSender(), toNano('0.05'), { to: admin.address });

        const adminProxyTonWalletAddress = await proxyTonMinter.getWalletAddress(admin.address);
        adminProxyTonWallet = blockchain.openContract(ProxyTonWallet.createFromAddress(adminProxyTonWalletAddress));
    });

    describe('op::transfer from the owner', () => {
        it('should send tx notification', async function () {
            const res = await adminProxyTonWallet.sendTransfer(admin.getSender(), toNano('10'), {
                jetton_amount: toNano('5'),
                to: user.address,
                response_address: user.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: 0n,
                forward_payload: Cell.EMPTY,
            });

            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: user.address,
                op: ops.transfer_notification,
                success: true,
            });
        });

        it('should send ton with mode carry remaining gas', async function () {
            const res = await adminProxyTonWallet.sendTransfer(admin.getSender(), toNano('10'), {
                jetton_amount: toNano('5'),
                to: user.address,
                response_address: user.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: 0n,
                forward_payload: Cell.EMPTY,
            });

            const notificationTx = res.transactions.map(flattenTransaction).find((tx) => {
                return tx.op === ops.transfer_notification;
            });

            // Exclude fee
            expect(notificationTx!.value).toBeInRange(toNano('9.99'), toNano('10'));
        });
    });

    describe('op::transfer from the user', () => {
        it('should rollback when forward_ton_amount + jetton_amount is not equal to msg value', async function () {
            const res = await adminProxyTonWallet.sendTransfer(user.getSender(), toNano('3'), {
                jetton_amount: toNano('1'),
                to: admin.address,
                response_address: admin.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: toNano('1'),
                forward_payload: Cell.EMPTY,
            });

            expect(res.transactions).not.toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: admin.address,
                op: ops.transfer_notification,
            });
            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: user.address,
                op: ops.excesses,
            });

            const excessesTx = res.transactions.map(flattenTransaction).find((tx) => {
                return tx.op === ops.excesses;
            });

            expect(excessesTx!.value).toBeInRange(toNano('2.999'), toNano('3'));
        });

        it('should send tx notification', async function () {
            const res = await adminProxyTonWallet.sendTransfer(user.getSender(), toNano('10'), {
                jetton_amount: toNano('9'),
                to: admin.address,
                response_address: admin.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: toNano('1'),
                forward_payload: Cell.EMPTY,
            });

            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: admin.address,
                op: ops.transfer_notification,
                success: true,
            });
        });

        it('should send ton only forwarded amount', async function () {
            const res = await adminProxyTonWallet.sendTransfer(user.getSender(), toNano('10'), {
                jetton_amount: toNano('3'),
                to: user.address,
                response_address: user.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: toNano('7'),
                forward_payload: Cell.EMPTY,
            });

            const notificationTx = res.transactions.map(flattenTransaction).find((tx) => {
                return tx.op === ops.transfer_notification;
            });
            expect(notificationTx!.value).toBeInRange(toNano('6.99'), toNano('7'));
        });
    });
});
