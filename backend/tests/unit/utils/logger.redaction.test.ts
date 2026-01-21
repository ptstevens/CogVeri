import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from '../../../src/utils/logger';

describe('Log Redaction Utilities', () => {
  describe('redactSensitiveData', () => {
    describe('sensitive field redaction', () => {
      it('should redact password fields', () => {
        const input = { username: 'john', password: 'secret123' };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.username).toBe('john');
        expect(result.password).toBe('secr...[REDACTED]');
      });

      it('should redact token fields', () => {
        const input = { userId: '123', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.userId).toBe('123');
        expect(result.token).toBe('eyJh...[REDACTED]');
      });

      it('should redact apiKey fields', () => {
        const input = { name: 'test', apiKey: 'sk_live_abc123def456ghi789' };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.name).toBe('test');
        expect(result.apiKey).toBe('sk_l...[REDACTED]');
      });

      it('should redact nested sensitive fields', () => {
        const input = {
          user: {
            email: 'test@test.com',
            credentials: {
              password: 'secret123',
              refreshToken: 'token123456789',
            },
          },
        };
        const result = redactSensitiveData(input) as any;

        expect(result.user.email).toBe('test@test.com');
        expect(result.user.credentials.password).toBe('secr...[REDACTED]');
        expect(result.user.credentials.refreshToken).toBe('toke...[REDACTED]');
      });

      it('should handle case-insensitive field matching', () => {
        const input = {
          Password: 'secret1',
          PASSWORD: 'secret2',
          passWord: 'secret3',
        };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.Password).toBe('secr...[REDACTED]');
        expect(result.PASSWORD).toBe('secr...[REDACTED]');
        expect(result.passWord).toBe('secr...[REDACTED]');
      });

      it('should show [REDACTED] for short values', () => {
        const input = { password: 'abc' };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.password).toBe('[REDACTED]');
      });

      it('should redact authorization headers', () => {
        const input = { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.authorization).toBe('Bear...[REDACTED]');
      });

      it('should redact credit card related fields', () => {
        const input = {
          cardNumber: '4111111111111111',
          creditCard: '5555555555554444',
          cvv: '123',
        };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.cardNumber).toBe('4111...[REDACTED]');
        expect(result.creditCard).toBe('5555...[REDACTED]');
        expect(result.cvv).toBe('[REDACTED]');
      });
    });

    describe('pattern-based redaction in strings', () => {
      it('should redact JWT tokens in strings', () => {
        const input = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        const result = redactSensitiveData(input);

        expect(result).toBe('Token: [REDACTED]');
      });

      it('should redact Bearer tokens in strings', () => {
        const input = 'Authorization: Bearer abc123def456';
        const result = redactSensitiveData(input);

        expect(result).toContain('[REDACTED]');
      });

      it('should redact credit card patterns', () => {
        const input = 'Card: 4111-1111-1111-1111 was charged';
        const result = redactSensitiveData(input);

        expect(result).toBe('Card: [REDACTED] was charged');
      });

      it('should redact SSN patterns', () => {
        const input = 'SSN: 123-45-6789 on file';
        const result = redactSensitiveData(input);

        expect(result).toBe('SSN: [REDACTED] on file');
      });
    });

    describe('array handling', () => {
      it('should redact sensitive data in arrays', () => {
        const input = [
          { name: 'user1', password: 'secret1' },
          { name: 'user2', password: 'secret2' },
        ];
        const result = redactSensitiveData(input) as any[];

        expect(result[0].name).toBe('user1');
        expect(result[0].password).toBe('secr...[REDACTED]');
        expect(result[1].name).toBe('user2');
        expect(result[1].password).toBe('secr...[REDACTED]');
      });
    });

    describe('edge cases', () => {
      it('should handle null values', () => {
        const result = redactSensitiveData(null);
        expect(result).toBeNull();
      });

      it('should handle undefined values', () => {
        const result = redactSensitiveData(undefined);
        expect(result).toBeUndefined();
      });

      it('should handle primitive values', () => {
        expect(redactSensitiveData(42)).toBe(42);
        expect(redactSensitiveData(true)).toBe(true);
        expect(redactSensitiveData('hello')).toBe('hello');
      });

      it('should handle empty objects', () => {
        const result = redactSensitiveData({});
        expect(result).toEqual({});
      });

      it('should handle deeply nested objects without infinite recursion', () => {
        // Create a deeply nested object (more than 10 levels)
        let obj: any = { value: 'test' };
        for (let i = 0; i < 15; i++) {
          obj = { nested: obj, password: 'secret' };
        }

        // Should not throw and should complete
        const result = redactSensitiveData(obj);
        expect(result).toBeDefined();
      });

      it('should handle objects with null/undefined field values', () => {
        const input = {
          password: null,
          token: undefined,
          name: 'test',
        };
        const result = redactSensitiveData(input) as Record<string, unknown>;

        expect(result.password).toBeNull();
        expect(result.token).toBeUndefined();
        expect(result.name).toBe('test');
      });
    });
  });
});
