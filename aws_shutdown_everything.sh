#!/usr/bin/env bash
set -euo pipefail

: "${AWS_PAGER:=}"
: "${AWS_DEFAULT_OUTPUT:=json}"
: "${FORCE:=0}"          # set to 1 to actually delete
: "${S3_DELETE:=0}"      # set to 1 to delete S3 buckets (DATA LOSS)
: "${ROUTE53_DELETE:=0}" # set to 1 to delete hosted zones (breaks DNS)
: "${ECR_DELETE:=0}"     # set to 1 to delete ECR repos/images (DATA LOSS)

log() { printf "[%s] %s\n" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }

# Run a command safely (argv), and DO NOT abort the whole script on failure.
run() {
  if [[ "$FORCE" == "1" ]]; then
    log "RUN: $*"
    set +e
    "$@"
    local rc=$?
    set -e
    if [[ $rc -ne 0 ]]; then
      log "WARN: command failed (rc=$rc): $*"
    fi
    return 0
  else
    log "DRY: $*"
    return 0
  fi
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }

need aws
need jq

ACCOUNT="$(aws sts get-caller-identity | jq -r .Account)"
ARN="$(aws sts get-caller-identity | jq -r .Arn)"
log "Caller: $ARN"
log "Account: $ACCOUNT"

REGIONS="$(aws ec2 describe-regions --query 'Regions[].RegionName' --output text)"
log "Regions: $REGIONS"

############################
# GuardDuty (per-region)
############################
disable_guardduty_region() {
  local r="$1"
  local detectors
  detectors="$(aws guardduty list-detectors --region "$r" | jq -r '.DetectorIds[]?')"
  [[ -z "$detectors" ]] && return 0

  while read -r det; do
    [[ -z "$det" ]] && continue
    # AWS CLI boolean is --enable / --no-enable (NOT --enable false)
    run aws guardduty update-detector --region "$r" --detector-id "$det" --no-enable
    run aws guardduty delete-detector  --region "$r" --detector-id "$det"
  done <<< "$detectors"
}

############################
# EKS
############################
delete_eks_region() {
  local r="$1"
  local clusters
  clusters="$(aws eks list-clusters --region "$r" | jq -r '.clusters[]?')"
  [[ -z "$clusters" ]] && return 0

  while read -r c; do
    [[ -z "$c" ]] && continue
    log "EKS cluster found in $r: $c"

    local ngs fps
    ngs="$(aws eks list-nodegroups --region "$r" --cluster-name "$c" | jq -r '.nodegroups[]?')"
    while read -r ng; do
      [[ -z "$ng" ]] && continue
      run aws eks delete-nodegroup --region "$r" --cluster-name "$c" --nodegroup-name "$ng"
    done <<< "$ngs"

    fps="$(aws eks list-fargate-profiles --region "$r" --cluster-name "$c" | jq -r '.fargateProfileNames[]?')"
    while read -r fp; do
      [[ -z "$fp" ]] && continue
      run aws eks delete-fargate-profile --region "$r" --cluster-name "$c" --fargate-profile-name "$fp"
    done <<< "$fps"

    run aws eks delete-cluster --region "$r" --name "$c"
  done <<< "$clusters"
}

############################
# ECS (services + tasks + clusters)
############################
delete_ecs_region() {
  local r="$1"
  local clusters
  clusters="$(aws ecs list-clusters --region "$r" | jq -r '.clusterArns[]?')"
  [[ -z "$clusters" ]] && return 0

  while read -r carn; do
    [[ -z "$carn" ]] && continue

    local tasks svcs
    tasks="$(aws ecs list-tasks --region "$r" --cluster "$carn" --desired-status RUNNING | jq -r '.taskArns[]?')"
    while read -r t; do
      [[ -z "$t" ]] && continue
      run aws ecs stop-task --region "$r" --cluster "$carn" --task "$t"
    done <<< "$tasks"

    svcs="$(aws ecs list-services --region "$r" --cluster "$carn" | jq -r '.serviceArns[]?')"
    while read -r s; do
      [[ -z "$s" ]] && continue
      run aws ecs update-service --region "$r" --cluster "$carn" --service "$s" --desired-count 0
      run aws ecs delete-service  --region "$r" --cluster "$carn" --service "$s" --force
    done <<< "$svcs"

    run aws ecs delete-cluster --region "$r" --cluster "$carn"
  done <<< "$clusters"
}

############################
# ELB/ALB/NLB
############################
delete_elb_region() {
  local r="$1"

  local lbs2 lbs
  lbs2="$(aws elbv2 describe-load-balancers --region "$r" | jq -r '.LoadBalancers[]?.LoadBalancerArn')"
  while read -r arn; do
    [[ -z "$arn" ]] && continue
    run aws elbv2 delete-load-balancer --region "$r" --load-balancer-arn "$arn"
  done <<< "$lbs2"

  lbs="$(aws elb describe-load-balancers --region "$r" | jq -r '.LoadBalancerDescriptions[]?.LoadBalancerName')"
  while read -r name; do
    [[ -z "$name" ]] && continue
    run aws elb delete-load-balancer --region "$r" --load-balancer-name "$name"
  done <<< "$lbs"
}

############################
# EC2: ASG, instances, volumes, EIPs, NAT, endpoints
############################
delete_asg_region() {
  local r="$1"
  local asgs
  asgs="$(aws autoscaling describe-auto-scaling-groups --region "$r" | jq -r '.AutoScalingGroups[]?.AutoScalingGroupName')"
  [[ -z "$asgs" ]] && return 0

  while read -r g; do
    [[ -z "$g" ]] && continue
    run aws autoscaling update-auto-scaling-group --region "$r" --auto-scaling-group-name "$g" --min-size 0 --max-size 0 --desired-capacity 0
    run aws autoscaling delete-auto-scaling-group  --region "$r" --auto-scaling-group-name "$g" --force-delete
  done <<< "$asgs"
}

terminate_ec2_instances_region() {
  local r="$1"
  local ids
  ids="$(aws ec2 describe-instances --region "$r" \
    --filters Name=instance-state-name,Values=pending,running,stopping,stopped,shutting-down \
    | jq -r '.Reservations[].Instances[].InstanceId' | sort -u)"
  [[ -z "$ids" ]] && return 0

  # Build argv list safely
  local -a args=(aws ec2 terminate-instances --region "$r" --instance-ids)
  while read -r id; do
    [[ -z "$id" ]] && continue
    args+=("$id")
  done <<< "$ids"
  run "${args[@]}"
}

delete_ebs_volumes_region() {
  local r="$1"
  local vols
  vols="$(aws ec2 describe-volumes --region "$r" --filters Name=status,Values=available | jq -r '.Volumes[]?.VolumeId')"
  [[ -z "$vols" ]] && return 0

  while read -r v; do
    [[ -z "$v" ]] && continue
    run aws ec2 delete-volume --region "$r" --volume-id "$v"
  done <<< "$vols"
}

release_eips_region() {
  local r="$1"
  local allocs
  allocs="$(aws ec2 describe-addresses --region "$r" | jq -r '.Addresses[]?.AllocationId')"
  [[ -z "$allocs" ]] && return 0

  while read -r a; do
    [[ -z "$a" ]] && continue
    run aws ec2 release-address --region "$r" --allocation-id "$a"
  done <<< "$allocs"
}

delete_nat_gateways_region() {
  local r="$1"
  local ngws
  ngws="$(aws ec2 describe-nat-gateways --region "$r" --filter Name=state,Values=available,pending,failed \
    | jq -r '.NatGateways[]?.NatGatewayId')"
  [[ -z "$ngws" ]] && return 0

  while read -r n; do
    [[ -z "$n" ]] && continue
    run aws ec2 delete-nat-gateway --region "$r" --nat-gateway-id "$n"
  done <<< "$ngws"
}

delete_vpc_endpoints_region() {
  local r="$1"
  local eps
  eps="$(aws ec2 describe-vpc-endpoints --region "$r" | jq -r '.VpcEndpoints[]?.VpcEndpointId')"
  [[ -z "$eps" ]] && return 0

  while read -r e; do
    [[ -z "$e" ]] && continue
    run aws ec2 delete-vpc-endpoints --region "$r" --vpc-endpoint-ids "$e"
  done <<< "$eps"
}

############################
# ECR
############################
delete_ecr_region() {
  local r="$1"
  [[ "$ECR_DELETE" != "1" ]] && return 0
  local repos
  repos="$(aws ecr describe-repositories --region "$r" | jq -r '.repositories[]?.repositoryName')"
  [[ -z "$repos" ]] && return 0

  while read -r repo; do
    [[ -z "$repo" ]] && continue
    run aws ecr delete-repository --region "$r" --repository-name "$repo" --force
  done <<< "$repos"
}

############################
# S3 (global) - destructive
############################
delete_s3_all() {
  [[ "$S3_DELETE" != "1" ]] && return 0
  local buckets
  buckets="$(aws s3api list-buckets | jq -r '.Buckets[]?.Name')"
  [[ -z "$buckets" ]] && return 0

  while read -r b; do
    [[ -z "$b" ]] && continue
    log "Deleting S3 bucket (recursive): $b"
    run aws s3 rm "s3://$b" --recursive
    run aws s3api delete-bucket --bucket "$b"
  done <<< "$buckets"
}

############################
# Route53 hosted zones (global) - destructive
############################
delete_route53_all() {
  [[ "$ROUTE53_DELETE" != "1" ]] && return 0
  local zones
  zones="$(aws route53 list-hosted-zones | jq -r '.HostedZones[]? | @base64')"
  [[ -z "$zones" ]] && return 0

  while read -r z; do
    [[ -z "$z" ]] && continue
    local id name tmp
    id="$(echo "$z" | base64 --decode | jq -r '.Id' | sed 's|/hostedzone/||')"
    name="$(echo "$z" | base64 --decode | jq -r '.Name')"
    log "Hosted zone: $name ($id)"

    local rrsets batch
    rrsets="$(aws route53 list-resource-record-sets --hosted-zone-id "$id" \
      | jq -c '.ResourceRecordSets[] | select(.Type!="NS" and .Type!="SOA")')"

    if [[ -n "$rrsets" ]]; then
      batch="$(echo "$rrsets" | jq -s '{Changes: map({Action:"DELETE", ResourceRecordSet: .})}')"
      tmp="$(mktemp)"
      echo "$batch" > "$tmp"
      run aws route53 change-resource-record-sets --hosted-zone-id "$id" --change-batch "file://$tmp"
      rm -f "$tmp"
    fi

    run aws route53 delete-hosted-zone --id "$id"
  done <<< "$zones"
}

main() {
  log "=== GuardDuty disable/delete across all regions ==="
  for r in $REGIONS; do disable_guardduty_region "$r"; done

  log "=== EKS delete across all regions ==="
  for r in $REGIONS; do delete_eks_region "$r"; done

  log "=== ECS delete across all regions ==="
  for r in $REGIONS; do delete_ecs_region "$r"; done

  log "=== Load balancers delete across all regions ==="
  for r in $REGIONS; do delete_elb_region "$r"; done

  log "=== Autoscaling groups delete across all regions ==="
  for r in $REGIONS; do delete_asg_region "$r"; done

  log "=== EC2 instances terminate across all regions ==="
  for r in $REGIONS; do terminate_ec2_instances_region "$r"; done

  log "=== VPC endpoints delete across all regions ==="
  for r in $REGIONS; do delete_vpc_endpoints_region "$r"; done

  log "=== NAT gateways delete across all regions ==="
  for r in $REGIONS; do delete_nat_gateways_region "$r"; done

  log "=== Release Elastic IPs across all regions ==="
  for r in $REGIONS; do release_eips_region "$r"; done

  log "=== Delete unattached EBS volumes across all regions ==="
  for r in $REGIONS; do delete_ebs_volumes_region "$r"; done

  log "=== Optional destructive deletes (S3/Route53/ECR) ==="
  for r in $REGIONS; do delete_ecr_region "$r"; done
  delete_s3_all
  delete_route53_all

  log "DONE."
}

main "$@"
