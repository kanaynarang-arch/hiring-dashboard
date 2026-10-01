'use client';

import { useActionState, useRef } from 'react';
import { uploadCandidateCv, type UploadState } from '@/app/actions';

const initialState: UploadState = {};

export default function UploadForm() {
  const [state, formAction, pending] = useActionState(uploadCandidateCv, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Upload a CV
      </h2>
      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500">CV (PDF)</label>
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:text-white dark:file:bg-zinc-100 dark:file:text-black"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Applied role</label>
          <select
            name="appliedRole"
            required
            defaultValue=""
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select role
            </option>
            <option value="pm">Product Manager</option>
            <option value="spm">Senior Product Manager</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
        >
          {pending ? 'Processing…' : 'Upload & Score'}
        </button>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="mt-2 text-sm text-green-600">{state.success}</p>}
    </section>
  );
}
