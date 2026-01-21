import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../utils/AppError';

/**
 * Validation middleware factory for Zod schemas.
 * Validates request body, query, or params against a Zod schema.
 *
 * @param schema - Zod schema to validate against
 * @param source - Which part of the request to validate ('body' | 'query' | 'params')
 */
export const validate = <T>(
  schema: ZodSchema<T>,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const validated = await schema.parseAsync(data);

      // Replace the original data with validated/transformed data
      (req as any)[source] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        next(
          new BadRequestError(
            `Validation failed: ${formattedErrors.map((e) => `${e.field}: ${e.message}`).join(', ')}`,
            { errors: formattedErrors }
          )
        );
      } else {
        next(error);
      }
    }
  };
};

/**
 * Validate multiple sources at once (body, query, params)
 */
export const validateRequest = <B = unknown, Q = unknown, P = unknown>(schemas: {
  body?: ZodSchema<B>;
  query?: ZodSchema<Q>;
  params?: ZodSchema<P>;
}) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const errors: Array<{ source: string; field: string; message: string }> = [];

      if (schemas.body) {
        try {
          (req as any).body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(
              ...error.errors.map((e) => ({
                source: 'body',
                field: e.path.join('.'),
                message: e.message,
              }))
            );
          }
        }
      }

      if (schemas.query) {
        try {
          (req as any).query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(
              ...error.errors.map((e) => ({
                source: 'query',
                field: e.path.join('.'),
                message: e.message,
              }))
            );
          }
        }
      }

      if (schemas.params) {
        try {
          (req as any).params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(
              ...error.errors.map((e) => ({
                source: 'params',
                field: e.path.join('.'),
                message: e.message,
              }))
            );
          }
        }
      }

      if (errors.length > 0) {
        next(
          new BadRequestError(
            `Validation failed: ${errors.map((e) => `${e.source}.${e.field}: ${e.message}`).join(', ')}`,
            { errors }
          )
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
