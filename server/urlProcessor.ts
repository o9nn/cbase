/**
 * URL Processor Service - Handles web scraping and content extraction
 * Part of Phase 9: URL Scraping & Web Crawling
 */

import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import robotsParser from 'robots-parser';
import axios from 'axios';

export interface UrlProcessingResult {
  url: string;
  title: string;
  content: string;
  markdown: string;
  metadata: {
    description?: string;
    keywords?: string;
    author?: string;
    publishedDate?: string;
    wordCount: number;
    links: string[];
  };
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  respectRobotsTxt?: boolean;
  userAgent?: string;
  timeout?: number;
  rateLimit?: number; // milliseconds between requests
  sameDomain?: boolean;
}

const DEFAULT_USER_AGENT = 'CBase-Bot/1.0 (+https://github.com/o9nn/cbase)';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RATE_LIMIT = 1000; // 1 second between requests

/**
 * Validate and normalize URL
 */
export function validateUrl(url: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    // Remove whitespace
    const trimmedUrl = url.trim();
    
    // Check if it has a protocol
    let normalizedUrl = trimmedUrl;
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      normalizedUrl = `https://${trimmedUrl}`;
    }
    
    // Parse URL
    const parsedUrl = new URL(normalizedUrl);
    
    // Check for valid protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are supported' };
    }
    
    // Check for localhost or private IPs (security)
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) || // 172.16.0.0/12
      hostname === '::1'
    ) {
      return { valid: false, error: 'Private or localhost URLs are not allowed' };
    }
    
    return { valid: true, normalized: parsedUrl.href };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Check robots.txt for permission to crawl
 */
export async function checkRobotsTxt(url: string, userAgent: string = DEFAULT_USER_AGENT): Promise<boolean> {
  try {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
    
    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      validateStatus: (status) => status === 200 || status === 404,
    });
    
    if (response.status === 404) {
      // No robots.txt means crawling is allowed
      return true;
    }
    
    const robots = robotsParser(robotsUrl, response.data);
    return robots.isAllowed(url, userAgent) ?? true;
  } catch (error) {
    // If we can't fetch robots.txt, assume it's allowed but log the error
    console.warn(`Failed to check robots.txt for ${url}:`, error);
    return true;
  }
}

/**
 * Extract main content from HTML
 */
function extractMainContent($: cheerio.CheerioAPI): string {
  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, iframe, noscript, [role="banner"], [role="navigation"], [role="complementary"]').remove();
  $('.advertisement, .ads, .sidebar, .menu, .navigation, .footer, .header').remove();
  
  // Try to find main content area
  let content = '';
  const mainSelectors = [
    'main',
    '[role="main"]',
    'article',
    '.content',
    '.main-content',
    '#content',
    '#main',
    'body',
  ];
  
  for (const selector of mainSelectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      content = element.text();
      break;
    }
  }
  
  // Clean up whitespace
  return content
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * Extract metadata from HTML
 */
function extractMetadata($: cheerio.CheerioAPI, url: string): UrlProcessingResult['metadata'] & { title: string } {
  const title = $('title').text().trim() ||
                $('meta[property="og:title"]').attr('content') ||
                $('h1').first().text().trim() ||
                'Untitled';
  
  const description = $('meta[name="description"]').attr('content') ||
                     $('meta[property="og:description"]').attr('content') ||
                     '';
  
  const keywords = $('meta[name="keywords"]').attr('content') || '';
  
  const author = $('meta[name="author"]').attr('content') ||
                $('meta[property="article:author"]').attr('content') ||
                '';
  
  const publishedDate = $('meta[property="article:published_time"]').attr('content') ||
                       $('meta[name="publish-date"]').attr('content') ||
                       '';
  
  // Extract all links
  const links: string[] = [];
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      try {
        const absoluteUrl = new URL(href, url).href;
        if (absoluteUrl.startsWith('http')) {
          links.push(absoluteUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  });
  
  // Get text content for word count
  const content = extractMainContent($);
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  
  return {
    title,
    description: description || undefined,
    keywords: keywords || undefined,
    author: author || undefined,
    publishedDate: publishedDate || undefined,
    wordCount,
    links: Array.from(new Set(links)), // Remove duplicates
  };
}

/**
 * Convert HTML to Markdown
 */
function htmlToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  
  // Add custom rules if needed
  turndownService.addRule('removeComments', {
    filter: (node) => node.nodeType === 8, // Comment node
    replacement: () => '',
  });
  
  return turndownService.turndown(html);
}

/**
 * Process a single URL and extract content
 */
export async function processUrl(
  url: string,
  options: CrawlOptions = {}
): Promise<UrlProcessingResult> {
  const {
    respectRobotsTxt = true,
    userAgent = DEFAULT_USER_AGENT,
    timeout = DEFAULT_TIMEOUT,
  } = options;
  
  // Validate URL
  const validation = validateUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid URL');
  }
  const normalizedUrl = validation.normalized!;
  
  // Check robots.txt
  if (respectRobotsTxt) {
    const allowed = await checkRobotsTxt(normalizedUrl, userAgent);
    if (!allowed) {
      throw new Error('URL blocked by robots.txt');
    }
  }
  
  // Fetch the page
  const response = await axios.get(normalizedUrl, {
    timeout,
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  
  // Parse HTML
  const $ = cheerio.load(response.data);
  
  // Extract content
  const content = extractMainContent($);
  const metadataWithTitle = extractMetadata($, normalizedUrl);
  
  // Separate title from metadata
  const { title, ...metadata } = metadataWithTitle;
  
  // Convert to markdown
  const markdown = htmlToMarkdown(response.data);
  
  return {
    url: normalizedUrl,
    title,
    content,
    markdown,
    metadata,
  };
}

/**
 * Filter URLs to stay within the same domain if required
 */
export function filterUrlsBySameDomain(baseUrl: string, urls: string[]): string[] {
  try {
    const baseDomain = new URL(baseUrl).hostname;
    return urls.filter(url => {
      try {
        return new URL(url).hostname === baseDomain;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Simple crawl function for multiple URLs with depth limit
 */
export async function crawlUrls(
  startUrl: string,
  options: CrawlOptions = {}
): Promise<UrlProcessingResult[]> {
  const {
    maxDepth = 1,
    maxPages = 10,
    rateLimit = DEFAULT_RATE_LIMIT,
    sameDomain = true,
  } = options;
  
  const results: UrlProcessingResult[] = [];
  const visited = new Set<string>();
  const toVisit: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  
  while (toVisit.length > 0 && results.length < maxPages) {
    const { url, depth } = toVisit.shift()!;
    
    // Skip if already visited
    if (visited.has(url)) {
      continue;
    }
    visited.add(url);
    
    try {
      // Process URL
      const result = await processUrl(url, options);
      results.push(result);
      
      // Add new URLs to visit if we haven't reached max depth
      if (depth < maxDepth && result.metadata.links.length > 0) {
        let newUrls = result.metadata.links;
        
        // Filter to same domain if required
        if (sameDomain) {
          newUrls = filterUrlsBySameDomain(startUrl, newUrls);
        }
        
        // Add unvisited URLs to the queue
        for (const newUrl of newUrls) {
          if (!visited.has(newUrl) && toVisit.length + results.length < maxPages) {
            toVisit.push({ url: newUrl, depth: depth + 1 });
          }
        }
      }
      
      // Rate limiting
      if (toVisit.length > 0) {
        await new Promise(resolve => setTimeout(resolve, rateLimit));
      }
    } catch (error) {
      console.error(`Failed to process URL ${url}:`, error);
      // Continue with next URL
    }
  }
  
  return results;
}
