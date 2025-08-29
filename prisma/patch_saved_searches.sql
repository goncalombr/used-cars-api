DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='query') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "query" TEXT NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='filters') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "filters" JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='notify') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "notify" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='cadence_mins') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "cadence_mins" INTEGER NOT NULL DEFAULT 1440;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='last_check') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "last_check" TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='last_notified') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "last_notified" TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='created_at') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_searches' AND column_name='updated_at') THEN
    ALTER TABLE "saved_searches" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END$$;