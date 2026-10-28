import type { FinalResume } from './final-resume';
import { buildCreativePdf } from './resume-pdf-creative';
import { buildProPdf } from './resume-pdf-pro';

// One entry point for every template. Standard templates (Professional,
// Compact, Executive) are black and white; Modern and Sidebar take an accent.
export type PdfTemplate = 'professional' | 'compact' | 'executive' | 'minimal' | 'modern' | 'sidebar' | 'classic';

export interface PdfOptions {
  template?: PdfTemplate;
  accent?: string; // #rrggbb, used by Modern and Sidebar
}

export async function buildResumePdf(resume: FinalResume, options: PdfOptions = {}): Promise<Uint8Array> {
  const template = options.template ?? 'professional';
  if (template === 'professional' || template === 'compact' || template === 'executive') {
    return buildProPdf(resume, template);
  }
  return buildCreativePdf(resume, { template, accent: options.accent });
}
