# Analysis of the "Trust in AI assistants" experiment
#
# Usage:
#   Rscript analysis/analysis.R             # reads data/participants.csv and data/cards.csv
#   Rscript analysis/analysis.R --simulate  # generates fake data to check the code
#
# Get the CSV files from Google Sheets with File > Download > CSV,
# once per tab ("participants" and "cards").

suppressPackageStartupMessages({
  library(dplyr)
  library(lme4)
  library(lmerTest)
  library(ggplot2)
})

args <- commandArgs(trailingOnly = TRUE)
simulate <- "--simulate" %in% args
dir.create("results", showWarnings = FALSE)

# ---------- Data ----------
if (simulate) {
  set.seed(1)
  n <- 300
  part <- tibble(
    pid = sprintf("p%03d", 1:n),
    cond_anchor = rbinom(n, 1, .5),
    cond_frame = sample(c("accuracy", "error"), n, TRUE),
    cond_decoy = sample(c("none", "target", "competitor"), n, TRUE),
    duration_s = round(runif(n, 100, 400)),
    attention_ok = rbinom(n, 1, .95)
  )
  profiles <- expand.grid(consistency = 0:1, transparency = 0:1, explainability = 0:1)
  cards <- part |>
    tidyr::crossing(profiles) |>
    group_by(pid) |>
    mutate(u = rnorm(1, 0, 12)) |>
    ungroup() |>
    mutate(
      trust = 35 + 20 * consistency + 10 * transparency + 14 * explainability +
        3 * cond_anchor + u + rnorm(n(), 0, 12),
      trust = pmin(100, pmax(0, round(trust))),
      follow = rbinom(n(), 1, plogis((trust - 55) / 10))
    )
  p_target <- c(none = .45, target = .58, competitor = .35)
  part$choice_target <- rbinom(n, 1, p_target[part$cond_decoy])
} else {
  part <- read.csv("data/participants.csv", stringsAsFactors = FALSE)
  cards <- read.csv("data/cards.csv", stringsAsFactors = FALSE)
}

# ---------- Exclusions (fix them before looking at the data) ----------
n_total <- nrow(part)
part <- part |>
  filter(attention_ok == 1, duration_s >= 90) |>
  distinct(pid, .keep_all = TRUE)
if ("prolific_pid" %in% names(part)) {
  # Keep only the first complete submission of each Prolific participant
  part <- part |>
    arrange(ts_server) |>
    filter(is.na(prolific_pid) | prolific_pid == "" | !duplicated(prolific_pid))
}
cards <- cards |> filter(pid %in% part$pid)
cat(sprintf("Participants: %d received, %d after exclusions\n", n_total, nrow(part)))

# ---------- Block 1: which missing attribute lowers trust the most ----------
# Coding: 1 = the attribute is missing (violation), 0 = present.
d <- cards |>
  mutate(
    no_consistency = 1 - consistency,
    no_transparency = 1 - transparency,
    no_explainability = 1 - explainability,
    anchor = cond_anchor,
    frame = factor(cond_frame, levels = c("accuracy", "error"))
  )

m1 <- lmer(
  trust ~ no_consistency + no_transparency + no_explainability +
    anchor * frame + (1 | pid),
  data = d
)
m1_int <- lmer(
  trust ~ (no_consistency + no_transparency + no_explainability)^3 +
    anchor * frame + (1 | pid),
  data = d
)
sink("results/models.txt")
cat("== Main model: main effects ==\n"); print(summary(m1))
cat("\n== Model with attribute interactions ==\n"); print(summary(m1_int))
cat("\n== Model comparison ==\n"); print(anova(m1, m1_int))
sink()

# Pairwise comparisons between trust losses (Wald tests)
b <- fixef(m1); V <- as.matrix(vcov(m1))
attrs <- c("no_consistency", "no_transparency", "no_explainability")
pairs <- combn(attrs, 2, simplify = FALSE)
comp <- do.call(rbind, lapply(pairs, function(p) {
  dif <- b[p[1]] - b[p[2]]
  se <- sqrt(V[p[1], p[1]] + V[p[2], p[2]] - 2 * V[p[1], p[2]])
  data.frame(comparison = paste(p[1], "-", p[2]), difference = dif, se = se,
             z = dif / se, p = 2 * pnorm(-abs(dif / se)))
}))
comp$p_holm <- p.adjust(comp$p, "holm")
rownames(comp) <- NULL
write.csv(comp, "results/attribute_comparisons.csv", row.names = FALSE)
print(comp, digits = 3)

# Intention to follow the recommendation (mixed logistic model)
m2 <- glmer(
  follow ~ no_consistency + no_transparency + no_explainability +
    anchor * frame + (1 | pid),
  data = d, family = binomial
)
sink("results/models.txt", append = TRUE)
cat("\n== Following the recommendation (mixed logistic) ==\n"); print(summary(m2))
sink()

# Figure: trust loss per missing attribute
ci <- confint(m1, parm = attrs, method = "Wald")
fig <- data.frame(
  attribute = c("Consistency", "Transparency", "Explainability"),
  effect = b[attrs], lo = ci[, 1], hi = ci[, 2]
) |>
  mutate(attribute = reorder(attribute, effect))

g <- ggplot(fig, aes(x = effect, y = attribute)) +
  geom_vline(xintercept = 0, colour = "grey60") +
  geom_errorbar(aes(xmin = lo, xmax = hi), width = .15, orientation = "y") +
  geom_point(size = 3) +
  labs(x = "Change in trust (0 to 100) when the attribute is missing, 95% CI",
       y = NULL,
       title = "Trust loss per missing attribute") +
  theme_minimal(base_size = 12)
ggsave("results/trust_loss.png", g, width = 7, height = 3.2, dpi = 300)

# ---------- Block 2: decoy effect ----------
part$cond_decoy <- factor(part$cond_decoy, levels = c("none", "target", "competitor"))
tab <- part |>
  group_by(cond_decoy) |>
  summarise(n = n(), prop_target = mean(choice_target), .groups = "drop")
print(tab)
m3 <- glm(choice_target ~ cond_decoy, data = part, family = binomial)
sink("results/models.txt", append = TRUE)
cat("\n== Decoy effect: choice of the target option ==\n"); print(tab); print(summary(m3))
sink()

cat("Results written to results/\n")
