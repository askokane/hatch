// Node 25 on Windows can make os.userInfo() fail with uv_os_get_passwd ENOMEM.
// tsx only needs a stable temp-directory suffix; defining geteuid selects its
// platform-neutral numeric path and has no effect on application behavior.
if (process.platform === "win32") {
  if (typeof process.geteuid !== "function") process.geteuid = () => 0;
  // tsx's temporary-directory helper calls os.userInfo() directly. Node 25 can
  // fail that Windows lookup with ENOMEM even when there is ample memory.
  const os = process.getBuiltinModule("node:os");
  os.userInfo = () => ({ uid: 0, gid: 0, username: "hatch", homedir: process.cwd(), shell: null });
}
