export interface ExportAutomationStatus {
  interactive: boolean;
  botAvailable: boolean;
  error?: string;
}

function executableSource(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function inspectExportAutomation(files: Record<string, string>): ExportAutomationStatus {
  const interactive = Object.entries(files)
    .filter(([path]) => path !== 'bot.js')
    .some(([, source]) => /\bworld\s*\.\s*input\b/.test(executableSource(source)));
  const botAvailable = typeof files['bot.js'] === 'string' && files['bot.js'].trim().length > 0;
  return {
    interactive,
    botAvailable,
    ...(interactive && !botAvailable ? { error: 'This project reads user input, so a root bot.js file is required for video export.' } : {})
  };
}
