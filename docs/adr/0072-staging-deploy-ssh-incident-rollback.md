# ADR-0072: Staging deploy SSH incident and rollback of the interim workflow changes

- Status: Accepted
- Date: 28 October 2026
- Related: ADR-0011 (single-VM runtime and immutable releases), ADR-0047 (shared validation and hosted release gates), ADR-0071 (dashboard stored timings)

## Context

Staging releases are delivered by `.github/workflows/deploy-reusable.yml`, called from `ci.yml` after the release candidate gate on every push to `staging`. The job connects from a GitHub-hosted runner to the VM over SSH with `StrictHostKeyChecking=yes` against the pinned `VM_SSH_KNOWN_HOSTS` secret, uploads an isolated candidate archive and runtime environment, and runs `deploy/scripts/remote-entrypoint.sh` under the VM-wide deploy lock (ADR-0011). The SSH port is `vars.VM_SSH_PORT`, defaulting to 22. The `staging` environment, its secrets and its variables are visible to the repository owner only.

The last successful staging deploy was `d252fc2` (merge of #104) on 27 October 2026. From about 23:00 UTC that day every deploy failed in its first SSH step:

| Release candidate | Attempt (UTC)                                  | Port | Result                                                               |
| ----------------- | ---------------------------------------------- | ---- | -------------------------------------------------------------------- |
| `da02237` (#105)  | 27 Oct ~23:13, 23:22–23:24; 28 Oct 00:57–01:00 | 22   | `ssh: connect to host *** port 22: Connection timed out`             |
| `b083d73` (#106)  | 28 Oct 01:57–02:00                             | 22   | timed out                                                            |
| `3a74679` (#107)  | 28 Oct 02:23–02:26                             | 22   | timed out                                                            |
| `adc3d76` (#108)  | 28 Oct ~02:57–03:0x                            | 2222 | upload succeeded; remote step failed with `bash: --: invalid option` |
| `d398f27` (#109)  | 28 Oct ~03:35 and 03:41–03:43                  | 2222 | timed out                                                            |

Evidence collected on the VM and from the provider:

- UFW was active with `22/tcp` (and later `2222/tcp`) allowed from anywhere on IPv4 and IPv6; the hPanel VPS firewall had no rule group; fail2ban was not installed.
- `sshd` listened on the configured ports and answered from an external network in Indonesia throughout, with the expected host key.
- The `sshd` journal for 27 October 23:00 – 28 October 00:55 contained no connection attempts from GitHub runners, only the external test and the hPanel web console.
- `satucare.com`, `admin-pad.satucare.com` and `srv1938802.hstgr.cloud` all resolve to the VM's IPv4 address; only the provider hostname also has an IPv6 record.
- The provider's support agent reported no managed firewall group, both ports reachable from its own tests, and successful key-based SSH logins from Microsoft Azure / GitHub runner addresses on 28 October, after the failures began. It did not find a provider-side block and recommended matching a failing runner's public address against what reaches the VM.

Four interim changes were merged to `staging` while the cause was investigated:

1. #106 added `-o HostKeyAlias="$REMOTE_HOST"` to every deploy and rehearsal `ssh`/`scp`, so the plain-host entry in `VM_SSH_KNOWN_HOSTS` would also verify a non-default port. The same edit accidentally removed the space in `bash -s -- '<env>'` in the remote deploy command.
2. #107 read `vars.VM_DEPLOY_SSH_PORT` before `vars.VM_SSH_PORT`, because a repository-level `VM_SSH_PORT=2222` had no effect on the #106 deploy (`REMOTE_PORT: 22` in its log).
3. #108 defaulted the port to 2222 and dropped `VM_SSH_PORT`, because `VM_DEPLOY_SSH_PORT=2222` also had no effect on the #107 deploy.
4. #109 restored the missing space after the #108 deploy reached the remote step.

On the VM, `sshd` was additionally configured to listen on 2222 (`/etc/ssh/sshd_config.d/10-extra-port.conf`) and UFW was opened for `2222/tcp`. Repository variables `VM_SSH_PORT=2222` and `VM_DEPLOY_SSH_PORT=2222` were created. A further change, #110, which logs the runner's public IPv4, the resolved destination and a 20-second TCP check before the upload, was opened but not merged.

None of these changes produced a successful staging release. One upload over port 2222 succeeded, after which the same port timed out for later runners, so a port change alone did not address the failure.

## Decision

- The deploy and rehearsal workflows on `staging` are restored exactly to their state at `da02237` (#105): host key verification without `HostKeyAlias`, the port taken from `vars.VM_SSH_PORT || '22'`, and the original remote command.
- The repository variables `VM_SSH_PORT` and `VM_DEPLOY_SSH_PORT` are deleted. Secrets were never modified and remain as they were.
- #110 is closed without merging. Diagnostic logging is to be reintroduced only as a separate, reviewed change if the failure persists.
- The handoff entries written by #106–#109 are replaced by a single incident record.
- The VM's additional SSH listener on 2222 and its UFW rule are operator-owned and are to be removed from the VM console, returning the host to its pre-incident SSH configuration.

## Rationale

- The interim changes did not restore delivery and one of them introduced a regression in the remote command, so keeping them would leave `staging` with untested deploy behaviour and no benefit.
- The evidence does not identify a single cause. The provider observes successful runner logins, the VM journal shows none during the failures, and repository variables did not reach the reusable job for reasons that cannot be inspected without owner access to the `staging` environment. Returning to the last configuration that produced a successful release (`d252fc2`) gives a known baseline for the next diagnosis.
- Deleting the unused variables avoids a silent change of port if the workflow is later edited to read them.

## Alternatives considered

- **Keep port 2222 with `HostKeyAlias`.** Rejected: the port timed out again after one success, and the change set depended on repository variables whose resolution in the deploy job is unexplained.
- **Re-run deploys until one succeeds.** Rejected as a remedy; three re-runs of `da02237` and two of `d398f27` failed.
- **Allowlist GitHub runner ranges on the VM.** Rejected: UFW already allows the ports from anywhere, and hosted-runner addresses are dynamic.
- **Private-network deploy path (for example Tailscale).** Not adopted in this change. It removes the dependency on inbound SSH from runner addresses, but adds a third-party dependency and new secrets that only the repository owner can scope to the `staging` environment.
- **Self-hosted runner on the VM.** Rejected for this public repository: workflows from fork pull requests could target it.
- **Pull-based deploy from the VM.** Not adopted: the runtime environment is generated from GitHub secrets today, so the VM would need a separate secret store and release-identity verification.

## Implementation

- `.github/workflows/deploy-reusable.yml` and `.github/workflows/rehearse-staging.yml` are restored from `da02237`; their contents are byte-identical to that commit.
- Repository variables are removed under Settings → Secrets and variables → Actions → Variables.
- VM rollback, from the web console:
  - `rm /etc/ssh/sshd_config.d/10-extra-port.conf && sshd -t && systemctl restart ssh`
  - `ufw delete allow 2222/tcp`
  - if a temporary SYN log rule was added: `iptables -D INPUT -p tcp --dport 2222 --syn -j LOG --log-prefix "SSH2222-SYN "`

## Consequences

- `staging` again deploys exactly as it did for `d252fc2`. The merge of this rollback triggers a deploy on port 22; if the underlying failure persists, it times out in the upload step as before, and the live release stays at `d252fc2` because activation happens only after a successful remote deploy and smoke checks (ADR-0011).
- The application changes merged in #105 (ADR-0071, including migration `20261027090000_dashboard_stored_timings`) remain in `staging` but are not live until a deploy succeeds. No migration ran on the VM during the incident.
- The rehearsal workflow is unaffected in practice because it is manually dispatched.

## Validation

- `git diff da02237 -- .github/workflows/deploy-reusable.yml .github/workflows/rehearse-staging.yml` is empty on the rollback branch.
- The hosted CI for the rollback pull request runs Actionlint, ShellCheck and the deployment-script tests; the deploy on merge shows whether port 22 is reachable from the runner.
- After any successful deploy, `https://satucare.com/ready` must report the merge commit as `releaseSha` with `migrations: ok`.

## Risks

- Deploys can remain blocked with no code-level remedy until the reachability problem is understood.
- The cause may lie in `staging` environment settings (for example an environment-level `VM_SSH_PORT` or `VM_HOST`) that a collaborator cannot inspect.
- The VM still offers SSH password authentication (`Permission denied (publickey,password)`); key-only authentication remains to be enforced.

## Follow-up

- The repository owner inspects the `staging` environment variables and secrets (`VM_SSH_PORT`, `VM_HOST`) and confirms they match the VM.
- If deploys still time out, a failing runner's public IPv4 and timestamp are captured and compared with a SYN log on the VM, so the failure can be attributed to the network path or to the host.
- A private-network deploy path is evaluated with the repository owner if the failure is confirmed to be on the network path.
- SSH password authentication is disabled on the VM once key-only access for deploys and the console is confirmed.
