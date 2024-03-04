import '@ton/test-utils';
import '../utils/matchers';
import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { ProxyTonMinter, ProxyTonMinterConfig } from '../wrappers/ProxyTonMinter';
import { ProxyTonWallet } from '../wrappers/ProxyTonWallet';

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

        const adminProxyTonWalletAddress = await proxyTonMinter.getWalletAddress(admin.address);
        adminProxyTonWallet = blockchain.openContract(ProxyTonWallet.createFromAddress(adminProxyTonWalletAddress));
    });

    describe('mint', () => {
        it('should deploy wallet', async function () {
            const res = await proxyTonMinter.sendMint(admin.getSender(), toNano('1'), { to: admin.address });
            const adminProxyTonWalletAddress = await proxyTonMinter.getWalletAddress(admin.address);

            expect(res.transactions).toHaveTransaction({
                from: proxyTonMinter.address,
                to: adminProxyTonWalletAddress,
                deploy: true,
                success: true,
            });
        });
    });
});
