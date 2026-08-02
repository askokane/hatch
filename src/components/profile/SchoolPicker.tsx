"use client";

import { useCallback } from "react";
import { ComboBox } from "@/components/ui/ComboBox";
import { searchSchoolsAction } from "@/actions/schools";
import { SCHOOL_NAME_MAX } from "@/lib/constants";

// School/university field. Type-ahead over every school already on the platform,
// but still free text: typing one that isn't listed is how it gets listed, and
// the action that saves the profile is what adds it (see ensureSchool).
export function SchoolPicker({
  value,
  onChange,
  label = "University / school",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const fetchSuggestions = useCallback(async (query: string) => {
    const res = await searchSchoolsAction(query);
    return res.ok ? res.data.map((s) => s.name) : [];
  }, []);

  return (
    <ComboBox
      label={label}
      value={value}
      onChange={onChange}
      fetchSuggestions={fetchSuggestions}
      hint="Start typing — pick yours if it's listed, or enter it to add it."
      placeholder="e.g. State University"
      maxLength={SCHOOL_NAME_MAX}
      emptyHint="Not listed yet — what you type will be added for everyone else."
      required
    />
  );
}
