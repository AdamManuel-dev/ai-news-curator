{{/*
Expand the name of the chart.
*/}}
{{- define "ai-news-curator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "ai-news-curator.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ai-news-curator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ai-news-curator.labels" -}}
helm.sh/chart: {{ include "ai-news-curator.chart" . }}
{{ include "ai-news-curator.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: ai-news-curator
{{- end }}

{{/*
Selector labels
*/}}
{{- define "ai-news-curator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ai-news-curator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "ai-news-curator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ai-news-curator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the namespace to use
*/}}
{{- define "ai-news-curator.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride }}
{{- end }}

{{/*
Database host helper
*/}}
{{- define "ai-news-curator.databaseHost" -}}
{{- if .Values.externalDatabase.enabled -}}
{{- .Values.externalDatabase.host -}}
{{- else if .Values.postgresql.enabled -}}
{{- printf "%s-postgresql" .Release.Name -}}
{{- else -}}
{{- .Values.config.db.host -}}
{{- end -}}
{{- end }}

{{/*
Redis host helper
*/}}
{{- define "ai-news-curator.redisHost" -}}
{{- if .Values.externalRedis.enabled -}}
{{- .Values.externalRedis.host -}}
{{- else if .Values.redis.enabled -}}
{{- printf "%s-redis-master" .Release.Name -}}
{{- else -}}
{{- .Values.config.redis.host -}}
{{- end -}}
{{- end }}

{{/*
Image reference
*/}}
{{- define "ai-news-curator.image" -}}
{{- $registryName := .Values.image.registry -}}
{{- $repositoryName := .Values.image.repository -}}
{{- $tag := .Values.image.tag | toString -}}
{{- if .Values.global.imageRegistry }}
    {{- printf "%s/%s:%s" .Values.global.imageRegistry $repositoryName $tag -}}
{{- else if $registryName }}
    {{- printf "%s/%s:%s" $registryName $repositoryName $tag -}}
{{- else }}
    {{- printf "%s:%s" $repositoryName $tag -}}
{{- end }}
{{- end }}

{{/*
Image pull secrets
*/}}
{{- define "ai-news-curator.imagePullSecrets" -}}
{{- $pullSecrets := list }}
{{- if .Values.global.imagePullSecrets }}
  {{- $pullSecrets = .Values.global.imagePullSecrets }}
{{- else if .Values.image.pullSecrets }}
  {{- $pullSecrets = .Values.image.pullSecrets }}
{{- end }}
{{- if $pullSecrets }}
imagePullSecrets:
{{- range $pullSecrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Storage class helper
*/}}
{{- define "ai-news-curator.storageClass" -}}
{{- if .Values.global.storageClass }}
storageClassName: {{ .Values.global.storageClass | quote }}
{{- else if .Values.persistence.storageClass }}
storageClassName: {{ .Values.persistence.storageClass | quote }}
{{- end }}
{{- end }}

{{/*
Create environment-specific values
*/}}
{{- define "ai-news-curator.environment" -}}
{{- $environment := .Values.environment | default "production" -}}
{{- $envConfig := index .Values.environments $environment -}}
{{- if $envConfig -}}
{{- toYaml $envConfig -}}
{{- end -}}
{{- end }}

{{/*
Merge environment-specific configuration
*/}}
{{- define "ai-news-curator.mergedConfig" -}}
{{- $base := .Values.config -}}
{{- $environment := .Values.environment | default "production" -}}
{{- $envConfig := index .Values.environments $environment -}}
{{- if and $envConfig $envConfig.config -}}
{{- $merged := deepCopy $base | mustMergeOverwrite $envConfig.config -}}
{{- toYaml $merged -}}
{{- else -}}
{{- toYaml $base -}}
{{- end -}}
{{- end }}

{{/*
Pod labels including custom labels
*/}}
{{- define "ai-news-curator.podLabels" -}}
{{ include "ai-news-curator.selectorLabels" . }}
{{- if .Values.podLabels }}
{{ toYaml .Values.podLabels }}
{{- end }}
{{- end }}

{{/*
Service annotations
*/}}
{{- define "ai-news-curator.serviceAnnotations" -}}
{{- if .Values.service.annotations }}
{{ toYaml .Values.service.annotations }}
{{- end }}
{{- end }}

{{/*
Ingress annotations
*/}}
{{- define "ai-news-curator.ingressAnnotations" -}}
{{- if .Values.ingress.annotations }}
{{ toYaml .Values.ingress.annotations }}
{{- end }}
{{- end }}

{{/*
Secret annotations
*/}}
{{- define "ai-news-curator.secretAnnotations" -}}
{{- if .Values.secrets.annotations }}
{{ toYaml .Values.secrets.annotations }}
{{- end }}
{{- end }}