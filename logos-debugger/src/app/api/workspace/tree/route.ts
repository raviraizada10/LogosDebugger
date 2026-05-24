import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface FileNode {
  name: string;
  path: string;
  relPath: string;
  isDir: boolean;
  children?: FileNode[];
}

function buildTree(dirPath: string, rootDir: string, depth = 0): FileNode[] {
  if (depth > 6) return []; // prevent deep recursion hangs
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];
    
    // Sort directories first, then files alphabetically
    const sortedItems = items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of sortedItems) {
      // Skip common hidden or heavy directories
      if (
        item.name === 'node_modules' ||
        item.name === '.git' ||
        item.name === '.next' ||
        item.name === 'out' ||
        item.name === 'build' ||
        item.name.startsWith('.')
      ) {
        continue;
      }

      const itemPath = path.join(dirPath, item.name);
      const relPath = path.relative(rootDir, itemPath);

      if (item.isDirectory()) {
        nodes.push({
          name: item.name,
          path: itemPath,
          relPath: relPath,
          isDir: true,
          children: buildTree(itemPath, rootDir, depth + 1),
        });
      } else {
        nodes.push({
          name: item.name,
          path: itemPath,
          relPath: relPath,
          isDir: false,
        });
      }
    }
    return nodes;
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err);
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspacePath = searchParams.get('path');

    if (!workspacePath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    if (!fs.existsSync(workspacePath)) {
      return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
    }

    const stat = fs.statSync(workspacePath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
    }

    const tree = buildTree(workspacePath, workspacePath);
    return NextResponse.json({ tree });
  } catch (error: any) {
    console.error('Error in GET /api/workspace/tree:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
