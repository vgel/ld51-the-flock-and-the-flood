/** Shuffle an array in-place */
export function shuffle(array: unknown[]) {
  let currentIndex = array.length;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
}

export function assert(condition: any, msg: string): asserts condition {
  if (!condition) {
    throw new Error(`assertion failed: ${msg}`);
  }
}

export function weightedChoose<T>(array: T[], getWeight: (elem: T) => number): T {
  const weightSum = array.reduce((acc, v) => acc + getWeight(v), 0);
  let random = Math.random() * weightSum;

  for (let elem of array) {
    random -= getWeight(elem);

    if (random <= 0) {
      return elem;
    }
  }

  // shouldn't be possible but jic
  return array[array.length - 1];
}
