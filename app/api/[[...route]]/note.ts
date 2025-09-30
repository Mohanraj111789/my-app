import { z } from "zod";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getAuthUser } from "@/lib/hono/hono-middlware";
import prisma from "@/lib/prisma";
import { logger } from "hono/logger";

// Schemas
const noteSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  content: z.string().optional(),
});

interface NoteInput {
  title: string;
  content?: string;
}

// Initialize Hono with logger middleware
export const noteRoute = new Hono()
  .use('*', logger())

  // Create a new note
  .post("/create", getAuthUser, async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json<NoteInput>();
      
      // Validate input
      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        throw new HTTPException(400, { message: "Title is required" });
      }
      
      if (body.title.length > 255) {
        throw new HTTPException(400, { message: "Title is too long" });
      }

      const note = await prisma.note.create({
        data: {
          title: body.title,
          content: body.content || '',
          userId: user.id,
        },
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return c.json({
        data: note,
      }, 201);
    } catch (error) {
      console.error('Error creating note:', error);
      throw new HTTPException(500, { 
        message: error instanceof Error ? error.message : "Failed to create note" 
      });
    }
  })
  .patch(
    "/update/:id",
    getAuthUser,
    async (c) => {
      try {
        const user = c.get("user");
        const { id } = c.req.param();
        const body = await c.req.json<Partial<NoteInput>>();
        
        // Validate ID
        if (!id || !id.match(/^[0-9a-f]{8}-?[0-9a-f]{4}-?4[0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}$/i)) {
          throw new HTTPException(400, { 
            message: "Invalid note ID format"
          });
        }

        const existingNote = await prisma.note.findFirst({
          where: { id, userId: user.id },
        });

        if (!existingNote) {
          throw new HTTPException(404, { 
            message: "Note not found" 
          });
        }

        const updatedNote = await prisma.note.update({
          where: { id },
          data: {
            title: body.title,
            content: body.content,
          },
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return c.json({
          success: true,
          data: updatedNote,
        });
      } catch (error) {
        console.error('Error updating note:', error);
        if (error instanceof HTTPException) throw error;
        throw new HTTPException(500, { 
          message: error instanceof Error ? error.message : "Failed to update note" 
        });
      }
    }
  )
  // Get all notes with pagination
  .get("/all", getAuthUser, async (c) => {
    try {
      const user = c.get("user");
      const query = c.req.query();
      
      // Parse pagination
      const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
      const limit = query.limit ? Math.min(100, Math.max(1, parseInt(query.limit, 10))) : 20;
      
      if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1 || limit > 100) {
        throw new HTTPException(400, { 
          message: "Invalid pagination parameters"
        });
      }
      const skip = (page - 1) * limit;

      const [notes, total] = await Promise.all([
        prisma.note.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.note.count({ where: { userId: user.id } }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return c.json({
        success: true,
        data: notes,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      console.error('Error fetching notes:', error);
      throw new HTTPException(500, { 
        message: error instanceof Error ? error.message : "Failed to fetch notes" 
      });
    }
  })
  // Get a single note by ID
  .get("/:id", getAuthUser, async (c) => {
    try {
      const user = c.get("user");
      const { id } = c.req.param();
      
      // Validate ID
      if (!id || !id.match(/^[0-9a-f]{8}-?[0-9a-f]{4}-?4[0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}$/i)) {
        throw new HTTPException(400, { 
          message: "Invalid note ID format"
        });
      }

      const note = await prisma.note.findFirst({
        where: { id, userId: user.id },
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!note) {
        throw new HTTPException(404, { 
          message: "Note not found" 
        });
      }

      return c.json({
        success: true,
        data: note,
      });
    } catch (error) {
      console.error(`Error fetching note: ${error}`);
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, { 
        message: error instanceof Error ? error.message : "Failed to fetch note" 
      });
    }
  });