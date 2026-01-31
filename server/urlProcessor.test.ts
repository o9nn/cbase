import { describe, it, expect } from 'vitest';
import { validateUrl, filterUrlsBySameDomain } from '../server/urlProcessor';

describe('URL Processor', () => {
  describe('validateUrl', () => {
    it('should validate and normalize valid URLs', () => {
      const result = validateUrl('https://example.com');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('https://example.com/');
    });

    it('should add https protocol if missing', () => {
      const result = validateUrl('example.com');
      expect(result.valid).toBe(true);
      expect(result.normalized).toContain('https://');
    });

    it('should reject localhost URLs', () => {
      const result = validateUrl('http://localhost:3000');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('localhost');
    });

    it('should reject private IP addresses', () => {
      const result1 = validateUrl('http://192.168.1.1');
      expect(result1.valid).toBe(false);

      const result2 = validateUrl('http://10.0.0.1');
      expect(result2.valid).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const result = validateUrl('not a url');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('filterUrlsBySameDomain', () => {
    it('should filter URLs to same domain', () => {
      const baseUrl = 'https://example.com';
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://other.com/page',
      ];
      
      const filtered = filterUrlsBySameDomain(baseUrl, urls);
      expect(filtered).toHaveLength(2);
      expect(filtered).toContain('https://example.com/page1');
      expect(filtered).toContain('https://example.com/page2');
      expect(filtered).not.toContain('https://other.com/page');
    });

    it('should handle subdomains correctly', () => {
      const baseUrl = 'https://example.com';
      const urls = [
        'https://example.com/page',
        'https://www.example.com/page',
        'https://subdomain.example.com/page',
      ];
      
      const filtered = filterUrlsBySameDomain(baseUrl, urls);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe('https://example.com/page');
    });
  });
});
