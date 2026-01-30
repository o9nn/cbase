/**
 * File Processing Service - Handles file upload and text extraction
 * Supports PDF, DOCX, DOC, TXT, and MD files
 */

import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

export interface ProcessedFile {
  text: string;
  metadata: {
    pageCount?: number;
    wordCount?: number;
    author?: string;
    title?: string;
    [key: string]: unknown;
  };
}

/**
 * Extract text from PDF file
 */
export async function extractTextFromPDF(filePath: string): Promise<ProcessedFile> {
  try {
    const dataBuffer = await readFile(filePath);
    const data = await (pdfParse as any).default(dataBuffer);
    
    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        wordCount: data.text.split(/\s+/).length,
        title: data.info?.Title,
        author: data.info?.Author,
      }
    };
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from DOCX file
 */
export async function extractTextFromDOCX(filePath: string): Promise<ProcessedFile> {
  try {
    const dataBuffer = await readFile(filePath);
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    
    return {
      text: result.value,
      metadata: {
        wordCount: result.value.split(/\s+/).length,
        messages: result.messages.map(m => m.message),
      }
    };
  } catch (error) {
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from plain text file (TXT, MD)
 */
export async function extractTextFromPlainText(filePath: string): Promise<ProcessedFile> {
  try {
    const text = await readFile(filePath, 'utf-8');
    
    return {
      text,
      metadata: {
        wordCount: text.split(/\s+/).length,
      }
    };
  } catch (error) {
    throw new Error(`Failed to read text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main function to process file based on type
 */
export async function processFile(filePath: string, fileType: string): Promise<ProcessedFile> {
  const normalizedType = fileType.toLowerCase();
  
  switch (normalizedType) {
    case 'pdf':
      return extractTextFromPDF(filePath);
    
    case 'docx':
    case 'doc':
      return extractTextFromDOCX(filePath);
    
    case 'txt':
    case 'md':
      return extractTextFromPlainText(filePath);
    
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Validate file size (max 10MB by default)
 */
export function validateFileSize(fileSize: number, maxSizeMB: number = 10): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return fileSize <= maxSizeBytes;
}

/**
 * Validate file type
 */
export function validateFileType(mimeType: string): boolean {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'text/plain',
    'text/markdown',
  ];
  
  return allowedTypes.includes(mimeType);
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase().slice(1);
}

/**
 * Map mime type to file type
 */
export function mimeTypeToFileType(mimeType: string): 'pdf' | 'docx' | 'doc' | 'txt' | 'md' {
  const mimeMap: Record<string, 'pdf' | 'docx' | 'doc' | 'txt' | 'md'> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'text/plain': 'txt',
    'text/markdown': 'md',
  };
  
  return mimeMap[mimeType] || 'txt';
}
