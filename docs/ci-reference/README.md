# Inactive GitHub Actions reference

`github-actions-ci.yml` is preserved byte-for-byte from the previous active workflow. It is outside `.github/workflows` and cannot be automatically triggered from this path. Do not copy it back, rerun or dispatch Actions: the owner explicitly requested stopping notifications from account-level quota/billing failures. GitHub remains the private main source repository; CNB is the authorized private mirror and optional CI runner. Shared local validation uses `scripts/ci-common.sh`.

Pushes are paused until the parent confirms the existing workflow is disabled in the GitHub UI. Local development and tests continue. No billing, quota, network or credential changes are made.
