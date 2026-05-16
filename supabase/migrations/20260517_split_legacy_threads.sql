-- Reorganiza emails legacy: cada assunto distinto vira sua propria thread/conversa.
-- Idempotente: so processa marketing_contacts (channel=email) sem thread_root_message_id.
-- Para cada um, agrupa mensagens por subject normalizado (sem prefixos Re:, Fwd: etc),
-- mantem a primeira thread no contato original, e cria novas rows para as demais.

DO $$
DECLARE
  c record;
  thread_subjects text[];
  current_subj text;
  i int;
  new_id uuid;
  last_msg text;
  last_at timestamptz;
  root_id text;
  legacy_marker text;
BEGIN
  FOR c IN
    SELECT mc.id, mc.email, mc.name, mc.phone, mc.tags, mc.internal_notes, mc.assigned_to, mc.sentiment, mc.created_at
    FROM marketing_contacts mc
    WHERE mc.channel = 'email'
      AND mc.thread_root_message_id IS NULL
  LOOP
    SELECT array_agg(norm_subj ORDER BY first_at)
    INTO thread_subjects
    FROM (
      SELECT
        regexp_replace(coalesce(subject, ''), '^((re|fwd?|res|enc|fw):\s*)+', '', 'gi') as norm_subj,
        min(created_at) as first_at
      FROM inbox_messages
      WHERE contact_id = c.id AND channel = 'email'
      GROUP BY 1
    ) t;

    IF thread_subjects IS NULL OR array_length(thread_subjects, 1) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT email_message_id INTO root_id
    FROM inbox_messages
    WHERE contact_id = c.id AND channel = 'email'
      AND regexp_replace(coalesce(subject, ''), '^((re|fwd?|res|enc|fw):\s*)+', '', 'gi') = thread_subjects[1]
    ORDER BY created_at ASC LIMIT 1;

    legacy_marker := '<legacy-' || c.id::text || '-1>';
    UPDATE marketing_contacts
    SET thread_root_message_id = coalesce(root_id, legacy_marker)
    WHERE id = c.id;

    SELECT
      coalesce(subject, '') || ' - ' || left(coalesce(body, ''), 200),
      created_at
    INTO last_msg, last_at
    FROM inbox_messages
    WHERE contact_id = c.id AND channel = 'email'
      AND regexp_replace(coalesce(subject, ''), '^((re|fwd?|res|enc|fw):\s*)+', '', 'gi') = thread_subjects[1]
    ORDER BY created_at DESC LIMIT 1;

    UPDATE marketing_contacts
    SET last_message = left(last_msg, 500), last_message_at = last_at
    WHERE id = c.id;

    IF array_length(thread_subjects, 1) >= 2 THEN
      FOR i IN 2..array_length(thread_subjects, 1) LOOP
        current_subj := thread_subjects[i];

        SELECT email_message_id INTO root_id
        FROM inbox_messages
        WHERE contact_id = c.id AND channel = 'email'
          AND regexp_replace(coalesce(subject, ''), '^((re|fwd?|res|enc|fw):\s*)+', '', 'gi') = current_subj
        ORDER BY created_at ASC LIMIT 1;

        SELECT
          coalesce(subject, '') || ' - ' || left(coalesce(body, ''), 200),
          created_at
        INTO last_msg, last_at
        FROM inbox_messages
        WHERE contact_id = c.id AND channel = 'email'
          AND regexp_replace(coalesce(subject, ''), '^((re|fwd?|res|enc|fw):\s*)+', '', 'gi') = current_subj
        ORDER BY created_at DESC LIMIT 1;

        legacy_marker := '<legacy-' || c.id::text || '-' || i || '>';
        INSERT INTO marketing_contacts (
          email, name, phone, channel, status, sentiment,
          last_message, last_message_at, unread_count, tags, internal_notes,
          assigned_to, thread_root_message_id, created_at, updated_at
        ) VALUES (
          c.email, c.name, c.phone, 'email', 'resolved', c.sentiment,
          left(last_msg, 500), last_at, 0, c.tags, c.internal_notes, c.assigned_to,
          coalesce(root_id, legacy_marker),
          c.created_at, now()
        ) RETURNING id INTO new_id;

        UPDATE inbox_messages
        SET contact_id = new_id
        WHERE contact_id = c.id AND channel = 'email'
          AND regexp_replace(coalesce(subject, ''), '^((re|fwd?|res|enc|fw):\s*)+', '', 'gi') = current_subj;
      END LOOP;
    END IF;
  END LOOP;
END $$;
