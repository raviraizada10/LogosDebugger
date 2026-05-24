/**
 * Logos AST-Pruned Context Stub Engine
 * 
 * Implements a lightweight, browser-and-server compatible TypeScript/JavaScript
 * parser that extracts signature metadata, preceding JSDoc docstrings, and 
 * module dependencies, and performs brace-matching AST body pruning. This provides
 * rich, lightweight context when execution flow highlights specific nodes in the IDE.
 */

export interface CodeContextMetadata {
  name: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'type-alias' | 'unknown';
  signature: string;
  docstring: string | null;
  dependencies: string[];
  range: { startLine: number; endLine: number };
}

export interface IndexerResult {
  filePath?: string;
  prunedCode: string;
  metadata: CodeContextMetadata[];
  dependencies: string[]; // Top-level imports
}

/**
 * Parses attributes or sub-dependencies out of a function or class definition
 */
export function extractLocalDependencies(body: string): string[] {
  const deps = new Set<string>();
  // Look for internal calls like db.query() or fetch() or other functions
  const callRegex = /\b([a-zA-Z0-9_$]+)\./g;
  let match;
  while ((match = callRegex.exec(body)) !== null) {
    if (match[1]) deps.add(match[1]);
  }
  return Array.from(deps);
}

/**
 * Parses a typescript/javascript code string to extract metadata and return a pruned code skeleton.
 */
export function pruneCodeAndExtractMetadata(code: string, filePath?: string): IndexerResult {
  const lines = code.split('\n');
  const metadata: CodeContextMetadata[] = [];
  const topLevelDeps = new Set<string>();
  
  // 1. Extract imports/dependencies
  const importRegex = /import\s+?(?:(?:type\s+)?[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
  const requireRegex = /(?:const|let|var)\s+?[\w*\s{},]*\s*=\s*require\(['"]([^'"]+)['"]\)/g;
  
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    if (match[1]) topLevelDeps.add(match[1]);
  }
  while ((match = requireRegex.exec(code)) !== null) {
    if (match[1]) topLevelDeps.add(match[1]);
  }

  // 2. Scan line-by-line to extract JSDoc comments, signatures, and perform block pruning
  const prunedLines: string[] = [];
  let currentDoc: string[] = [];
  let inDoc = false;
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Catch JSDoc comments
    if (trimmed.startsWith('/**')) {
      inDoc = true;
      currentDoc = [line];
      prunedLines.push(line);
      i++;
      continue;
    }
    if (inDoc) {
      currentDoc.push(line);
      prunedLines.push(line);
      if (trimmed.endsWith('*/')) {
        inDoc = false;
      }
      i++;
      continue;
    }

    // Preserve standard single-line comments in skeleton
    if (trimmed.startsWith('//')) {
      prunedLines.push(line);
      i++;
      continue;
    }

    // Match keywords: function, class, interface, type, const arrow-function
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/);
    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_$]+)/);
    const arrowFuncMatch = trimmed.match(/^(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/);

    if (funcMatch || classMatch || interfaceMatch || typeMatch || arrowFuncMatch) {
      const name = (funcMatch || classMatch || interfaceMatch || typeMatch || arrowFuncMatch)![1];
      let type: CodeContextMetadata['type'] = 'function';
      if (classMatch) type = 'class';
      else if (interfaceMatch) type = 'interface';
      else if (typeMatch) type = 'type-alias';
      else if (arrowFuncMatch) type = 'variable';

      // Clean the preceding docstring lines
      let docstring: string | null = null;
      if (currentDoc.length > 0) {
        docstring = currentDoc
          .map(l => l.trim().replace(/^\/\*\*|\*\/|^\*\s?/g, ''))
          .filter(l => l !== '')
          .join('\n')
          .trim();
        currentDoc = []; // consume JSDoc
      }

      let signatureLines: string[] = [];
      let foundBlockStart = false;
      const startLine = i + 1;
      
      // Look forward to find the start of the body or statement end
      let j = i;
      let signatureStr = '';
      while (j < lines.length) {
        const currentScanLine = lines[j];
        signatureLines.push(currentScanLine);
        signatureStr += ' ' + currentScanLine.trim();

        if (signatureStr.includes('{')) {
          foundBlockStart = true;
          break;
        }
        if (signatureStr.includes(';')) {
          // No body, just single statement declaration
          break;
        }
        j++;
      }

      if (foundBlockStart) {
        // Trace bracket depth to prune implementation details
        let k = j;
        let charIndex = lines[k].indexOf('{') + 1;
        let braceCount = 1;
        let bodyAccumulator = '';

        while (k < lines.length && braceCount > 0) {
          const scanLine = lines[k];
          while (charIndex < scanLine.length && braceCount > 0) {
            const char = scanLine[charIndex];
            bodyAccumulator += char;
            if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
            charIndex++;
          }
          if (braceCount > 0) {
            k++;
            charIndex = 0;
            bodyAccumulator += '\n';
          }
        }

        const rawSignature = signatureLines.join('\n').split('{')[0].trim();
        const localDeps = extractLocalDependencies(bodyAccumulator);

        metadata.push({
          name,
          type,
          signature: rawSignature,
          docstring,
          dependencies: localDeps,
          range: { startLine, endLine: k + 1 }
        });

        // Insert stubbed declaration into pruned code skeleton
        const indent = lines[i].match(/^\s*/)?.[0] || '';
        prunedLines.push(`${indent}${rawSignature} { /* implementation pruned */ }`);
        
        i = k + 1;
      } else {
        // Statement/Type/Overload without body
        const rawSignature = signatureLines.join('\n').trim();
        metadata.push({
          name,
          type,
          signature: rawSignature,
          docstring,
          dependencies: [],
          range: { startLine, endLine: j + 1 }
        });
        prunedLines.push(lines[i]);
        i = j + 1;
      }
      continue;
    }

    // Normal line (or unused doc reset), keep in skeleton
    if (trimmed.length > 0) {
      currentDoc = [];
    }
    prunedLines.push(line);
    i++;
  }

  return {
    filePath,
    prunedCode: prunedLines.join('\n'),
    metadata,
    dependencies: Array.from(topLevelDeps)
  };
}

/**
 * Searches the indexed file metadata for a specific symbol/identifier context
 */
export function querySymbolContext(result: IndexerResult, name: string): CodeContextMetadata | null {
  const match = result.metadata.find(m => m.name.toLowerCase() === name.toLowerCase());
  return match || null;
}
