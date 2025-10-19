import { describe, expect, it } from 'vitest';
import { generateApiKey, hashSecret, verifySecret } from '../src/security';
describe('security helpers', () => {
    it('generates sufficiently long api keys', () => {
        const key = generateApiKey();
        expect(key).toHaveLength(64);
    });
    it('hashes and verifies secrets', async () => {
        const hash = await hashSecret('super-secret');
        expect(hash).not.toBe('super-secret');
        const valid = await verifySecret('super-secret', hash);
        expect(valid).toBe(true);
    });
});
