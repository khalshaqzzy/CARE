/**
 * Four-step wizard stepper (Upload → Validasi → Preview → Konfirmasi) with
 * numbered nodes and dashed connectors, per the Import design target.
 * `step` is zero-based; completed steps render filled, the current step
 * renders filled with a ring, upcoming steps render hollow.
 */
export function AdminStepper({
  steps,
  step,
}: {
  steps: { title: string; hint: string }[];
  step: number;
}) {
  return (
    <ol className="admin-stepper" aria-label="Tahapan impor">
      {steps.map((item, index) => {
        const state = index < step ? 'done' : index === step ? 'current' : 'todo';
        return (
          <li key={item.title} className="admin-stepper__item" data-state={state}>
            <span className="admin-stepper__node" aria-hidden="true">
              {index + 1}
            </span>
            <span className="admin-stepper__text">
              <strong>{item.title}</strong>
              <small>{item.hint}</small>
            </span>
            {index < steps.length - 1 ? (
              <span className="admin-stepper__link" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
