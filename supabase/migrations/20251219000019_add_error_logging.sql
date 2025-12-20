-- Create a robust error logging system

CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "level" text NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
    "source" text NOT NULL,
    "message" text NOT NULL,
    "details" jsonb,
    "user_id" uuid DEFAULT auth.uid(),
    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."system_logs" OWNER TO "postgres";

-- Function to write logs (can be called from other functions)
CREATE OR REPLACE FUNCTION "public"."log_system_event"(
    "p_level" text,
    "p_source" text,
    "p_message" text,
    "p_details" jsonb DEFAULT '{}'::jsonb
) RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER -- Runs as owner to ensure it can always write
AS $$
BEGIN
    INSERT INTO system_logs (level, source, message, details)
    VALUES (p_level, p_source, p_message, p_details);
END;
$$;

-- Grant access
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";
