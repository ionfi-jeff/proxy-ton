expect.extend({
    toBeInRange(received: bigint, minExpectedAmount: bigint, maxExpectedAmount: bigint) {
        const pass = received >= minExpectedAmount && received <= maxExpectedAmount;
        if (pass) {
            return {
                message: () =>
                    `expected ${received} not to be within range [${minExpectedAmount}, ${maxExpectedAmount}]`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected ${received} to be within range [${minExpectedAmount}, ${maxExpectedAmount}]`,
                pass: false,
            };
        }
    },
});
