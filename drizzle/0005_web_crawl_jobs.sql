-- Migration: Add webCrawlJobs table for Phase 9 URL scraping
CREATE TABLE IF NOT EXISTS `webCrawlJobs` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `sourceId` int NOT NULL,
  `agentId` int NOT NULL,
  `userId` int NOT NULL,
  `baseUrl` text NOT NULL,
  `crawlDepth` int DEFAULT 1 NOT NULL,
  `maxPages` int DEFAULT 10 NOT NULL,
  `status` enum('queued', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'queued' NOT NULL,
  `urlsProcessed` int DEFAULT 0,
  `urlsTotal` int DEFAULT 0,
  `urlsDiscovered` json,
  `pagesExtracted` int DEFAULT 0,
  `errorMessage` text,
  `metadata` json,
  `startedAt` timestamp,
  `completedAt` timestamp,
  `createdAt` timestamp DEFAULT (now()) NOT NULL,
  `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
