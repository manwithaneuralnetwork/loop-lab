import { defineConfig } from 'vite';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PROJECTS_ROOT = path.resolve('projects');

function safeProjectPath(root, relativePath) {
  const resolved = path.resolve(root, relativePath.replace(/\\/g, '/'));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid project file path.');
  return resolved;
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-project';
}

async function readDiskProject(directory) {
  const manifestPath = path.join(directory, 'project.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const files = await Promise.all((manifest.files || []).map(async (file) => {
    const filePath = safeProjectPath(directory, file.path);
    if (file.kind === 'asset') {
      const bytes = await fs.readFile(filePath);
      return { ...file, content: `data:${file.mime || 'application/octet-stream'};base64,${bytes.toString('base64')}` };
    }
    return { ...file, content: await fs.readFile(filePath, 'utf8') };
  }));
  return { ...manifest, files };
}

async function listDiskProjects() {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try { projects.push(await readDiskProject(path.join(PROJECTS_ROOT, entry.name))); } catch { /* Ignore incomplete project folders. */ }
  }
  return projects;
}

async function writeDiskProject(project) {
  const existing = (await listDiskProjects()).find((candidate) => candidate.id === project.id || candidate.name === project.name);
  const directory = path.join(PROJECTS_ROOT, existing ? slugify(existing.name) : slugify(project.name));
  await fs.mkdir(directory, { recursive: true });
  const files = [];
  for (const file of project.files || []) {
    const filePath = safeProjectPath(directory, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    if (file.kind === 'asset' && /^data:/.test(file.content)) {
      const match = file.content.match(/^data:([^;,]+)?;base64,(.*)$/s);
      if (!match) throw new Error(`Unsupported asset encoding: ${file.path}`);
      await fs.writeFile(filePath, Buffer.from(match[2], 'base64'));
    } else await fs.writeFile(filePath, file.content, 'utf8');
    files.push({ id: file.id, path: file.path, kind: file.kind, ...(file.mime ? { mime: file.mime } : {}) });
  }
  const manifest = { ...project, format: 'loop-lab-project-directory', version: 1, files };
  await fs.writeFile(path.join(directory, 'project.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function projectDevelopmentPlugin() {
  return {
    name: 'loop-lab-development-projects',
    configureServer(server) {
      server.middlewares.use('/__loop/projects', async (request, response) => {
        try {
          response.setHeader('Content-Type', 'application/json');
          if (request.method === 'GET') {
            response.end(JSON.stringify(await listDiskProjects())); return;
          }
          if (request.method === 'PUT') {
            let body = '';
            for await (const chunk of request) body += chunk;
            const project = JSON.parse(body);
            await writeDiskProject(project);
            response.end(JSON.stringify({ ok: true })); return;
          }
          response.statusCode = 405; response.end(JSON.stringify({ error: 'Method not allowed.' }));
        } catch (error) {
          response.statusCode = 400; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [projectDevelopmentPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@codemirror') || id.includes('node_modules/codemirror')) {
            return 'editor';
          }
        }
      }
    }
  }
});
