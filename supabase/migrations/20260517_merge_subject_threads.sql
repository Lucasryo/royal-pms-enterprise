-- Merge contatos email separados que pertencem a mesma conversa
-- (mesmo subject normalizado dentro de 30 dias). Janela curta evita falso positivo.
DO $$
DECLARE
  g record;
  keep_id uuid;
  drop_id uuid;
  i int;
BEGIN
  FOR g IN
    WITH msg_norm AS (
      SELECT im.id as msg_id, im.contact_id, im.created_at,
        lower(regexp_replace(coalesce(im.subject, ''), '^((re|fwd?|res|enc|fw|encaminhada):\s*)+', '', 'gi')) as norm_subj
      FROM inbox_messages im
      WHERE im.channel = 'email' AND im.direction = 'in'
    )
    SELECT norm_subj, array_agg(DISTINCT contact_id) as contacts
    FROM msg_norm
    WHERE norm_subj <> '' AND length(norm_subj) > 2
    GROUP BY norm_subj
    HAVING count(DISTINCT contact_id) > 1
       AND (max(created_at) - min(created_at)) < interval '30 days'
  LOOP
    SELECT contact_id INTO keep_id
    FROM inbox_messages
    WHERE contact_id = ANY(g.contacts) AND channel = 'email'
    ORDER BY created_at ASC LIMIT 1;

    FOR i IN 1..array_length(g.contacts, 1) LOOP
      drop_id := g.contacts[i];
      IF drop_id = keep_id THEN CONTINUE; END IF;
      UPDATE inbox_messages SET contact_id = keep_id WHERE contact_id = drop_id;
      DELETE FROM marketing_contacts mc
      WHERE mc.id = drop_id
        AND NOT EXISTS (SELECT 1 FROM inbox_messages WHERE contact_id = mc.id);
    END LOOP;

    UPDATE marketing_contacts mc
    SET last_message = (
      SELECT coalesce(subject, '') || ' - ' || left(coalesce(body, ''), 200)
      FROM inbox_messages WHERE contact_id = mc.id
      ORDER BY created_at DESC LIMIT 1
    ),
    last_message_at = (
      SELECT max(created_at) FROM inbox_messages WHERE contact_id = mc.id
    )
    WHERE mc.id = keep_id;
  END LOOP;
END $$;
