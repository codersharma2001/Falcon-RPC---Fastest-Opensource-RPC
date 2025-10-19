import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findUserByEmail } from '../repositories/userRepository';
import { verifySecret } from '../security';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const { email, password } = parseResult.data;
    const user = await findUserByEmail(email);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await verifySecret(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ sub: user.id, role: user.role, email: user.email }, { expiresIn: '12h' });
    return reply.send({ token });
  });
}
