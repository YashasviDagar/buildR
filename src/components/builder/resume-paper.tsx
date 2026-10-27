import type { FinalResume, ResumeSection } from '@/lib/final-resume';
import type { TemplateId } from '@/lib/builder/model';

// HTML twin of the PDF layout: same data, same section order, same template
// rules, so what the user sees is what they download.
export function ResumePaper({
  resume,
  template,
  accent,
}: {
  resume: FinalResume;
  template: TemplateId;
  accent: string;
}) {
  const modern = template === 'modern';
  const minimal = template === 'minimal';
  const side = template === 'sidebar';
  const contact = resume.contact.join('  |  ');
  const showPhoto = Boolean(resume.photo) && (modern || side);
  const photo = showPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resume.photo} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
  ) : null;

  const heading = (title: string) => (
    <h3
      className="mt-4 text-[11px] font-bold tracking-wide"
      style={{
        color: minimal ? '#111827' : accent,
        borderBottom:
          minimal || side ? 'none' : `${template === 'classic' ? 1.5 : 1}px solid ${template === 'classic' ? accent : '#d1d5db'}`,
        paddingBottom: minimal || side ? 0 : 2,
      }}
    >
      {title}
    </h3>
  );

  const renderSection = (section: ResumeSection) => (
    <div key={section.title}>
      {heading(section.title)}
      {section.entries.map((entry, i) => (
        <div key={i} className="mt-1.5">
          <div className="text-[10.5px] font-bold">{entry.heading}</div>
          {entry.meta && <div className="text-[9px] text-gray-500">{entry.meta}</div>}
          {entry.bullets.length > 0 && (
            <ul className="mt-0.5 list-disc pl-4">
              {entry.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {(section.lines ?? []).map((l, i) => (
        <p key={i} className="mt-1 break-words">
          {l}
        </p>
      ))}
    </div>
  );

  const summary = resume.summary && (
    <>
      {heading('SUMMARY')}
      <p className="mt-1">{resume.summary}</p>
    </>
  );

  const empty = resume.sections.length === 0 && !resume.summary;
  const leftTitles = new Set(['EDUCATION', 'SKILLS']);

  return (
    <div
      className="mx-auto w-full overflow-hidden rounded-md bg-white text-[#111827] shadow-lg"
      style={{ aspectRatio: '210 / 297' }}
    >
      <div className="h-full overflow-hidden text-[10px] leading-snug">
        {modern && (
          <div className="flex items-center gap-3 px-7 py-4 text-white" style={{ background: accent }}>
            {photo}
            <div>
              <div className="text-xl font-bold">{resume.name}</div>
              {resume.headline && <div className="text-[11px]">{resume.headline}</div>}
              <div className="mt-1 text-[9px]">{contact}</div>
            </div>
          </div>
        )}

        <div className="px-7 pb-6" style={{ paddingTop: modern ? 6 : 24 }}>
          {side && (
            <div className="mb-3 flex items-center gap-4">
              {photo}
              <div>
                <div className="text-2xl font-bold">{resume.name}</div>
                {resume.headline && (
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">{resume.headline}</div>
                )}
              </div>
            </div>
          )}

          {!modern && !side && (
            <div className={minimal ? 'text-left' : 'text-center'}>
              <div className="text-xl font-bold" style={{ color: minimal ? '#111827' : accent }}>
                {resume.name}
              </div>
              {resume.headline && <div className="text-[11px] text-gray-500">{resume.headline}</div>}
              <div className="mt-0.5 text-[9px] text-gray-500">{contact}</div>
              {template === 'classic' && <div className="mt-2 h-px" style={{ background: accent }} />}
            </div>
          )}

          {side ? (
            <div className="grid grid-cols-[34%_1fr] gap-0">
              <div className="min-w-0 pr-3">
                {resume.contact.length > 0 && (
                  <>
                    {heading('CONTACT')}
                    {resume.contact.map((c) => (
                      <p key={c} className="mt-1 break-words text-[9px]">
                        {c}
                      </p>
                    ))}
                  </>
                )}
                {resume.sections.filter((s) => leftTitles.has(s.title)).map(renderSection)}
              </div>
              <div className="min-w-0 border-l border-gray-200 pl-4">
                {summary}
                {resume.sections.filter((s) => !leftTitles.has(s.title)).map(renderSection)}
              </div>
            </div>
          ) : (
            <>
              {summary}
              {resume.sections.map(renderSection)}
            </>
          )}

          {empty && (
            <p className="mt-6 text-center text-gray-400">Start filling in the form and your resume appears here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
