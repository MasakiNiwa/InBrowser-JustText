/**
 * The register of editing commands.
 *
 * A new feature is added with one register() call here, and turns up in the
 * tools menu on its own.
 *
 * Every command is handed a context; see src/ui/context.js for its shape.
 *   - a plain text transform is easiest through transform(), which takes care
 *     of the selection for you
 *   - anything else works the context directly from run()
 */

const commands = new Map();

/** Labels are i18n keys. An unknown key shows as itself, so an add-on may pass plain text. */
export const GROUPS = [
  { id: 'text', label: 'group.text' },
  { id: 'line', label: 'group.line' },
  { id: 'json', label: 'group.json' },
  { id: 'file', label: 'group.file' },
];

/**
 * Registers a command.
 * @param {object} cmd
 * @param {string} cmd.id      unique id
 * @param {string} cmd.label   name in the menu (an i18n key, or plain text)
 * @param {string} cmd.group   one of the ids in GROUPS
 * @param {string} [cmd.hint]  a line of explanation
 * @param {(ctx:object)=>void|Promise<void>} [cmd.run]
 * @param {(text:string, ctx:object)=>string} [cmd.transform] transforms the whole text
 * @param {(text:string)=>string} [cmd.lineTransform] transforms the selected lines, or all of them
 */
export function register(cmd) {
  if (!cmd?.id) throw new Error('a command needs an id');
  if (commands.has(cmd.id)) throw new Error(`duplicate command id: ${cmd.id}`);
  commands.set(cmd.id, cmd);
  return cmd;
}

export function getCommand(id) {
  return commands.get(id);
}

export function listCommands() {
  return [...commands.values()];
}

/** Groups the commands for the menu to draw. */
export function listByGroup() {
  return GROUPS.map((g) => ({
    ...g,
    commands: listCommands().filter((c) => c.group === g.id),
  })).filter((g) => g.commands.length > 0);
}

/** Runs a command, wrapping transform and lineTransform in the shared handling. */
export async function runCommand(id, ctx) {
  const cmd = commands.get(id);
  if (!cmd) throw new Error(`unknown command: ${id}`);

  if (cmd.lineTransform) {
    ctx.applyToSelectedLines(cmd.lineTransform, cmd.label);
    return;
  }
  if (cmd.transform) {
    const before = ctx.getText();
    const after = cmd.transform(before, ctx);
    if (after !== before) ctx.setText(after, { label: cmd.label });
    return;
  }
  await cmd.run(ctx);
}
