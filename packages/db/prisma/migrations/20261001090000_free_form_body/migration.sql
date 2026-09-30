-- Field-less content types no longer get the Body editor by default: it now shows only
-- for a "body" field or the Schema Builder's "Free-form page" switch (schema.freeFormBody).
-- So upgrading changes nothing for existing workspaces, turn the switch on for every
-- field-less type that already has body content on at least one entry (live or draft).
-- "", whitespace and empty paragraphs ("<p></p>") don't count. Field-less types with no
-- body content stay off. Each type switched on is logged as a WARNING in the Postgres
-- server log (`prisma migrate deploy` does not echo it; the release notes say where to look).
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        UPDATE "ContentType" ct
        SET "schema" = jsonb_set(ct."schema"::jsonb, '{freeFormBody}', 'true'::jsonb)
        WHERE ct."kind" <> 'COMPONENT'
          AND jsonb_typeof(ct."schema"::jsonb) = 'object'
          AND NOT (ct."schema"::jsonb ? 'freeFormBody')
          AND (jsonb_typeof(ct."schema"::jsonb -> 'fields') IS DISTINCT FROM 'array'
               OR jsonb_array_length(ct."schema"::jsonb -> 'fields') = 0)
          AND EXISTS (
              SELECT 1 FROM "ContentEntry" e
              CROSS JOIN LATERAL (VALUES (e."data"::jsonb -> 'body'), (e."draftData"::jsonb -> 'body')) AS b(body)
              WHERE e."contentTypeId" = ct."id"
                AND jsonb_typeof(b.body) = 'string'
                AND b.body #>> '{}' !~* '^(\s|<p>\s*(<br\s*/?>)?\s*</p>)*$'
          )
        RETURNING ct."id", ct."name", ct."workspaceId"
    LOOP
        RAISE WARNING 'free-form page switched on for content type "%" (id %, workspace %)', t."name", t."id", t."workspaceId";
    END LOOP;
END $$;
