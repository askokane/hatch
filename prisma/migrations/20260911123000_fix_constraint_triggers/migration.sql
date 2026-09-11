CREATE OR REPLACE FUNCTION hatch_check_project_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text;
BEGIN
  IF TG_OP = 'DELETE' THEN pid := OLD."projectId"; ELSE pid := NEW."projectId"; END IF;
  IF EXISTS (SELECT 1 FROM "Project" WHERE id=pid) AND NOT EXISTS (SELECT 1 FROM "Membership" WHERE "projectId"=pid AND "isOwner") THEN
    RAISE EXCEPTION 'project % must retain an owner', pid;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION hatch_check_thread_members() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text;
BEGIN
  IF TG_TABLE_NAME = 'Thread' THEN
    IF TG_OP = 'DELETE' THEN tid := OLD.id; ELSE tid := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN tid := OLD."threadId"; ELSE tid := NEW."threadId"; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM "Thread" WHERE id=tid) AND (SELECT count(*) FROM "ThreadMember" WHERE "threadId"=tid) <> 2 THEN
    RAISE EXCEPTION 'direct thread % must have exactly two members', tid;
  END IF;
  RETURN NULL;
END $$;
