export const userColors = [
  "#ff2d75",
  "#00d1ff",
  "#ffe156",
  "#3cff9e",
  "#b967ff",
  "#ff8f3c",
  "#36f1cd",
  "#f7f7ff",
]

export function createUserId() {
  return `user-${crypto.randomUUID().slice(0, 8)}`
}

export function getAssignedColor(userCount: number) {
  return userColors[userCount % userColors.length]
}
