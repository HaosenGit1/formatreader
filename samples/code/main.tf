# Terraform sample (opens as plain text — no colours yet)
resource "aws_s3_bucket" "site" {
  bucket = "formatreader-site"
}

output "bucket" {
  value = aws_s3_bucket.site.bucket
}
