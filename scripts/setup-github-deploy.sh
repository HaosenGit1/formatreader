#!/usr/bin/env bash
# ONE-TIME SETUP (run it yourself, after reading it): lets GitHub Actions
# publish formatreader.com automatically when code is merged into main.
#
# What it creates in your AWS account:
#   1. GitHub's login service as a trusted identity provider (if not there yet)
#   2. Role "formatreader-github-deploy" that ONLY this repo's main branch can use
#   3. Permissions for that role: write files in the site bucket and refresh
#      the CloudFront cache for this one distribution. Nothing else.
# No passwords or access keys are stored anywhere; GitHub gets a short-lived
# login for each deployment.
#
# Undo later with:
#   aws iam delete-role-policy --role-name formatreader-github-deploy --policy-name deploy-site
#   aws iam delete-role --role-name formatreader-github-deploy
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="AChicagoGit/formatreader"
BUCKET=$(node -p "require('./deploy.config.json').bucket")
DIST=$(node -p "require('./deploy.config.json').distributionId")
DARN=$(node -p "require('./deploy.config.json').distributionArn")
TMP=$(mktemp -d)

PROV=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?ends_with(Arn, 'token.actions.githubusercontent.com')].Arn" --output text)
if [ -z "$PROV" ]; then
  PROV=$(aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd \
    --query OpenIDConnectProviderArn --output text)
  echo "Created GitHub identity provider"
fi

# GitHub identifies the workflow by repo and branch. Repos may use the
# "immutable" format with numeric IDs (owner@id/repo@id); ask GitHub which.
PREFIX=$(gh api "repos/$REPO/actions/oidc/customization/sub" --jq '.sub_claim_prefix // empty' 2>/dev/null || true)
SUB="${PREFIX:-repo:$REPO}:ref:refs/heads/main"

cat > "$TMP/trust.json" <<JSON
{ "Version": "2012-10-17", "Statement": [{
  "Effect": "Allow",
  "Principal": { "Federated": "$PROV" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "${SUB}"
    }
  }
}]}
JSON

cat > "$TMP/policy.json" <<JSON
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::$BUCKET" },
  { "Effect": "Allow", "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"], "Resource": "arn:aws:s3:::$BUCKET/*" },
  { "Effect": "Allow", "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"], "Resource": "$DARN" }
]}
JSON

ROLE=$(aws iam create-role --role-name formatreader-github-deploy \
  --assume-role-policy-document "file://$TMP/trust.json" \
  --description "GitHub Actions deploys formatreader.com (main branch only)" \
  --query Role.Arn --output text)
aws iam put-role-policy --role-name formatreader-github-deploy --policy-name deploy-site --policy-document "file://$TMP/policy.json"

# Tell the GitHub workflow which role, bucket and distribution to use.
gh variable set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "$ROLE"
gh variable set SITE_BUCKET --repo "$REPO" --body "$BUCKET"
gh variable set CLOUDFRONT_DISTRIBUTION_ID --repo "$REPO" --body "$DIST"
rm -rf "$TMP"
echo "Done. Every merge to main now deploys formatreader.com automatically."
