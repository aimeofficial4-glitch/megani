import { Router, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { db } from '../db/index.ts';
import {
  noteFolders,
  knowledgeNotes,
  noteTags,
  noteSources,
  noteAttachments,
} from '../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';

export const notesRoutes = Router();

notesRoutes.use(requireAuth);

notesRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.currentUser!.id;
    const [folders, notes] = await Promise.all([
      db.select().from(noteFolders).where(eq(noteFolders.userId, uid)).orderBy(noteFolders.name),
      db
        .select()
        .from(knowledgeNotes)
        .where(eq(knowledgeNotes.userId, uid))
        .orderBy(desc(knowledgeNotes.isPinned), desc(knowledgeNotes.updatedAt)),
    ]);

    const noteIds = notes.map((n) => n.id);
    const [allTags, allSources, allAttachments] = await Promise.all([
      noteIds.length > 0 ? db.select().from(noteTags) : Promise.resolve([]),
      noteIds.length > 0 ? db.select().from(noteSources) : Promise.resolve([]),
      noteIds.length > 0 ? db.select().from(noteAttachments) : Promise.resolve([]),
    ]);

    const hydrated = notes.map((n) => ({
      ...n,
      tags: allTags.filter((t) => t.noteId === n.id).map((t) => t.tag),
      sources: allSources.filter((s) => s.noteId === n.id),
      attachments: allAttachments.filter((a) => a.noteId === n.id),
    }));

    return res.json({ folders, notes: hydrated });
  } catch (err) {
    console.error('GET /api/notes error:', err);
    return res.status(500).json({ error: 'Failed to load notes workspace.' });
  }
});

notesRoutes.post('/folders', async (req: AuthRequest, res: Response) => {
  try {
    const { name, color = '#258BFF' } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Folder name is required.' });
    const [created] = await db
      .insert(noteFolders)
      .values({ userId: req.currentUser!.id, name: String(name).trim(), color })
      .returning();
    return res.status(201).json({ folder: created });
  } catch {
    return res.status(500).json({ error: 'Failed to create note folder.' });
  }
});

notesRoutes.delete('/folders/:id', async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(noteFolders)
      .where(and(eq(noteFolders.id, req.params.id), eq(noteFolders.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete folder.' });
  }
});

notesRoutes.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      content = '',
      folderId = null,
      projectId = null,
      videoId = null,
      tags = [],
      aiSummaryIncluded = false,
      isPrivate = true,
    } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Note title is required.' });

    const [created] = await db
      .insert(knowledgeNotes)
      .values({
        userId: req.currentUser!.id,
        folderId: folderId || null,
        projectId: projectId || null,
        videoId: videoId || null,
        title: String(title).trim(),
        content: String(content),
        aiSummaryIncluded: Boolean(aiSummaryIncluded),
        isPrivate: Boolean(isPrivate),
      })
      .returning();

    if (Array.isArray(tags) && tags.length > 0) {
      await db.insert(noteTags).values(
        tags
          .map((t) => String(t).trim())
          .filter(Boolean)
          .map((tag) => ({ noteId: created.id, tag }))
      );
    }

    return res.status(201).json({
      note: { ...created, tags: Array.isArray(tags) ? tags : [], sources: [], attachments: [] },
    });
  } catch (err) {
    console.error('POST /api/notes error:', err);
    return res.status(500).json({ error: 'Failed to create note.' });
  }
});

notesRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(knowledgeNotes)
      .where(and(eq(knowledgeNotes.id, req.params.id), eq(knowledgeNotes.userId, req.currentUser!.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Note not found.' });

    const { title, content, folderId, projectId, videoId, isPinned, isPrivate, tags } = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = String(title).trim() || existing.title;
    if (content !== undefined) updates.content = String(content);
    if (folderId !== undefined) updates.folderId = folderId || null;
    if (projectId !== undefined) updates.projectId = projectId || null;
    if (videoId !== undefined) updates.videoId = videoId || null;
    if (typeof isPinned === 'boolean') updates.isPinned = isPinned;
    if (typeof isPrivate === 'boolean') updates.isPrivate = isPrivate;

    const [updated] = await db
      .update(knowledgeNotes)
      .set(updates)
      .where(eq(knowledgeNotes.id, existing.id))
      .returning();

    if (Array.isArray(tags)) {
      await db.delete(noteTags).where(eq(noteTags.noteId, existing.id));
      const cleanTags = tags.map((t) => String(t).trim()).filter(Boolean);
      if (cleanTags.length > 0) {
        await db.insert(noteTags).values(cleanTags.map((tag) => ({ noteId: existing.id, tag })));
      }
    }

    return res.json({ note: updated });
  } catch {
    return res.status(500).json({ error: 'Failed to update note.' });
  }
});

notesRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(knowledgeNotes)
      .where(and(eq(knowledgeNotes.id, req.params.id), eq(knowledgeNotes.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete note.' });
  }
});

notesRoutes.post('/:id/sources', async (req: AuthRequest, res: Response) => {
  try {
    const [note] = await db
      .select()
      .from(knowledgeNotes)
      .where(and(eq(knowledgeNotes.id, req.params.id), eq(knowledgeNotes.userId, req.currentUser!.id)))
      .limit(1);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const { title, url, publisher, publishedDate, excerpt } = req.body || {};
    if (!title || !url) return res.status(400).json({ error: 'Source title and URL are required.' });

    const [created] = await db
      .insert(noteSources)
      .values({
        noteId: note.id,
        title: String(title).trim(),
        url: String(url).trim(),
        publisher: publisher ? String(publisher).trim() : null,
        publishedDate: publishedDate ? String(publishedDate).trim() : null,
        excerpt: excerpt ? String(excerpt).trim() : null,
      })
      .returning();

    return res.status(201).json({ source: created });
  } catch {
    return res.status(500).json({ error: 'Failed to attach source link.' });
  }
});

notesRoutes.delete('/:id/sources/:sourceId', async (req: AuthRequest, res: Response) => {
  try {
    const [note] = await db
      .select()
      .from(knowledgeNotes)
      .where(and(eq(knowledgeNotes.id, req.params.id), eq(knowledgeNotes.userId, req.currentUser!.id)))
      .limit(1);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    await db
      .delete(noteSources)
      .where(and(eq(noteSources.id, req.params.sourceId), eq(noteSources.noteId, note.id)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to remove source.' });
  }
});

notesRoutes.post('/:id/attachments', async (req: AuthRequest, res: Response) => {
  try {
    const [note] = await db
      .select()
      .from(knowledgeNotes)
      .where(and(eq(knowledgeNotes.id, req.params.id), eq(knowledgeNotes.userId, req.currentUser!.id)))
      .limit(1);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const { label, attachmentType = 'link', referenceUrl } = req.body || {};
    if (!label || !referenceUrl) return res.status(400).json({ error: 'Label and URL are required.' });

    const [created] = await db
      .insert(noteAttachments)
      .values({
        noteId: note.id,
        label: String(label).trim(),
        attachmentType: String(attachmentType),
        referenceUrl: String(referenceUrl).trim(),
      })
      .returning();

    return res.status(201).json({ attachment: created });
  } catch {
    return res.status(500).json({ error: 'Failed to attach link.' });
  }
});

notesRoutes.delete('/:id/attachments/:attachmentId', async (req: AuthRequest, res: Response) => {
  try {
    const [note] = await db
      .select()
      .from(knowledgeNotes)
      .where(and(eq(knowledgeNotes.id, req.params.id), eq(knowledgeNotes.userId, req.currentUser!.id)))
      .limit(1);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    await db
      .delete(noteAttachments)
      .where(and(eq(noteAttachments.id, req.params.attachmentId), eq(noteAttachments.noteId, note.id)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete attachment.' });
  }
});

notesRoutes.post('/:id/export/docx', async (req: AuthRequest, res: Response) => {
  try {
    const [note] = await db
      .select()
      .from(knowledgeNotes)
      .where(and(eq(knowledgeNotes.id, req.params.id), eq(knowledgeNotes.userId, req.currentUser!.id)))
      .limit(1);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const [sources, tags] = await Promise.all([
      db.select().from(noteSources).where(eq(noteSources.noteId, note.id)),
      db.select().from(noteTags).where(eq(noteTags.noteId, note.id)),
    ]);

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: note.title, heading: HeadingLevel.TITLE }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `2MR – To Master Research | Personal Knowledge Note | Tags: ${tags.map((t) => t.tag).join(', ') || 'None'}`,
                  italics: true,
                }),
              ],
            }),
            new Paragraph({ text: 'Notes', heading: HeadingLevel.HEADING_1 }),
            ...note.content.split('\n').map((line) => new Paragraph({ text: line })),
            new Paragraph({ text: 'Attached Original Sources', heading: HeadingLevel.HEADING_1 }),
            ...(sources.length > 0
              ? sources.map(
                  (s) =>
                    new Paragraph({
                      text: `• ${s.title} (${s.publisher || 'Source'}, ${s.publishedDate || 'n.d.'}) — ${s.url}`,
                    })
                )
              : [new Paragraph({ text: 'No external sources attached.' })]),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeFile = note.title.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40) || '2mr-note';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFile}.docx"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Note DOCX export error:', err);
    return res.status(500).json({ error: 'Failed to export DOCX.' });
  }
});
