"use client";

import { useState } from "react";
import { reportAction } from "@/actions/safety";
import type { ReportSubjectType } from "@/lib/validation/message.schema";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import { Modal } from "@/components/ui/Modal";

const REASONS = ["Spam", "Harassment", "Impersonation", "Inappropriate content", "Other"];

export function ReportDialog({
  subjectType,
  subjectId,
  subjectLabel,
  compact = false,
}: {
  subjectType: ReportSubjectType;
  subjectId: string;
  subjectLabel: string;
  /**
   * Renders the trigger as a bare text link sized to a feed card's metadata row
   * instead of a full ghost button. The feed puts this control beside a 2xs
   * timestamp, where a standard button is louder than the action deserves —
   * reporting should be available, not advertised.
   */
  compact?: boolean;
}) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mono text-2xs text-ink-muted hover:text-brick"
        >
          report
        </button>
      ) : (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Report
        </Button>
      )}
      {open && (
        <Modal title={`Report ${subjectLabel}`} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            <Select
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              options={REASONS.map((r) => ({ value: r, label: r }))}
            />
            <TextArea
              label="Detail (optional)"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await reportAction({ subjectType, subjectId, reason, detail });
                  setBusy(false);
                  if (res.ok) {
                    notify("Report submitted. Thank you.", "success");
                    setOpen(false);
                  } else {
                    notify(res.error, "error");
                  }
                }}
              >
                Submit report
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
