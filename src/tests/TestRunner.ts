export interface TestFailure {
  suiteName: string;
  testName: string;
  error: Error;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  failures: TestFailure[];
  logOutput: string;
}

type TestCaseFn = () => Promise<void> | void;

interface TestCase {
  name: string;
  fn: TestCaseFn;
}

interface TestSuite {
  name: string;
  cases: TestCase[];
}

export interface ExpectMatcher {
  toBe(expected: any): void;
  toEqual(expected: any): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toContain(item: any): void;
  toThrow(expectedError?: any): void;
  not: ExpectMatcher;
}

export class TestRunner {
  private static instance: TestRunner | null = null;
  private suites: TestSuite[] = [];
  private currentSuiteName = 'DefaultSuite';

  public get suiteCount(): number {
    return this.suites.length;
  }

  public get totalCasesCount(): number {
    return this.suites.reduce((sum, s) => sum + s.cases.length, 0);
  }

  public static getInstance(): TestRunner {
    if (!TestRunner.instance) {
      TestRunner.instance = new TestRunner();
    }
    return TestRunner.instance;
  }

  public reset(): void {
    this.suites = [];
    this.currentSuiteName = 'DefaultSuite';
  }

  public registerSuite(
    name: string,
    defineFn: (suite: { it: (testName: string, fn: TestCaseFn) => void }) => void
  ): void {
    this.currentSuiteName = name;
    let suite = this.suites.find(s => s.name === name);
    if (!suite) {
      suite = { name, cases: [] };
      this.suites.push(suite);
    }
    const currentSuite = suite;

    const testScope = {
      it: (testName: string, fn: TestCaseFn) => {
        currentSuite.cases.push({ name: testName, fn });
      }
    };

    defineFn(testScope as any);
  }

  public addCase(suiteName: string, testName: string, fn: TestCaseFn): void {
    let suite = this.suites.find(s => s.name === suiteName);
    if (!suite) {
      suite = { name: suiteName, cases: [] };
      this.suites.push(suite);
    }
    suite.cases.push({ name: testName, fn });
  }

  public getCurrentSuiteName(): string {
    return this.currentSuiteName;
  }

  public async runAll(maxDurationMs: number = 5000): Promise<TestSummary> {
    const startTime = Date.now();
    let total = 0;
    let passed = 0;
    let failed = 0;
    const failures: TestFailure[] = [];
    const logs: string[] = [];

    logs.push('=== LIVE JEST CLIENT TEST SUITE RESULTS ===');
    logs.push(`Timestamp: ${new Date().toISOString()}`);
    logs.push('');

    for (const suite of this.suites) {
      if (Date.now() - startTime > maxDurationMs) {
        logs.push(`[TIMEOUT] Hard deadline limit (${maxDurationMs}ms) reached. Aborting remaining test suites.`);
        break;
      }
      logs.push(`--- SUITE: ${suite.name} ---`);
      for (const testCase of suite.cases) {
        if (Date.now() - startTime > maxDurationMs) {
          logs.push(`[TIMEOUT] Hard deadline limit (${maxDurationMs}ms) reached. Aborting remaining tests.`);
          break;
        }
        total++;
        const fullName = `${suite.name} > ${testCase.name}`;
        try {
          const runPromise = Promise.resolve(testCase.fn());
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Test timed out after 2000ms')), 2000)
          );
          await Promise.race([runPromise, timeoutPromise]);
          passed++;
          logs.push(`[PASSED] ${fullName}`);
        } catch (err: any) {
          failed++;
          const errorObj = err instanceof Error ? err : new Error(String(err));
          failures.push({ suiteName: suite.name, testName: testCase.name, error: errorObj });
          logs.push(`[FAILED] ${fullName}`);
          logs.push(`  Error: ${errorObj.message}`);
          if (errorObj.stack) {
            logs.push(`  Stack Trace:\n${errorObj.stack.split('\n').map(l => '    ' + l).join('\n')}`);
          }
          logs.push('');
        }
      }
      logs.push('');
    }

    logs.unshift(`SUMMARY: Total: ${total} | Passed: ${passed} | Failed: ${failed}\n`);

    return {
      total,
      passed,
      failed,
      failures,
      logOutput: logs.join('\n')
    };
  }

  public static assertEquals<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(message || `Assertion failed: expected '${expected}', got '${actual}'`);
    }
  }

  public static assertTrue(value: boolean, message?: string): void {
    if (value !== true) {
      throw new Error(message || `Assertion failed: expected true, got ${value}`);
    }
  }

  public static assertFalse(value: boolean, message?: string): void {
    if (value !== false) {
      throw new Error(message || `Assertion failed: expected false, got ${value}`);
    }
  }

  public static assertNotNull<T>(value: T | null | undefined, message?: string): T {
    if (value === null || value === undefined) {
      throw new Error(message || 'Assertion failed: value is null or undefined');
    }
    return value;
  }
}

export function describe(suiteName: string, fn: () => void): void {
  const runner = TestRunner.getInstance();
  runner.registerSuite(suiteName, () => {
    fn();
  });
}

export function it(testName: string, fn: () => Promise<void> | void): void {
  const runner = TestRunner.getInstance();
  const suiteName = runner.getCurrentSuiteName();
  runner.addCase(suiteName, testName, fn);
}

export const test = it;

function createMatcher(actual: any, isNot = false): ExpectMatcher {
  function check(condition: boolean, msg: string) {
    const pass = isNot ? !condition : condition;
    if (!pass) {
      throw new Error(msg);
    }
  }

  const matchers: ExpectMatcher = {
    toBe(expected: any) {
      check(actual === expected, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toBe(${JSON.stringify(expected)}) failed`);
    },
    toEqual(expected: any) {
      const match = JSON.stringify(actual) === JSON.stringify(expected);
      check(match, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toEqual(${JSON.stringify(expected)}) failed`);
    },
    toBeTruthy() {
      check(Boolean(actual) === true, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toBeTruthy() failed`);
    },
    toBeFalsy() {
      check(Boolean(actual) === false, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toBeFalsy() failed`);
    },
    toBeNull() {
      check(actual === null, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toBeNull() failed`);
    },
    toBeUndefined() {
      check(actual === undefined, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toBeUndefined() failed`);
    },
    toBeDefined() {
      check(actual !== undefined && actual !== null, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toBeDefined() failed`);
    },
    toContain(item: any) {
      let contains = false;
      if (typeof actual === 'string') {
        contains = actual.includes(item);
      } else if (Array.isArray(actual)) {
        contains = actual.includes(item);
      } else if (actual instanceof Set) {
        contains = actual.has(item);
      }
      check(contains, `expect(${JSON.stringify(actual)}).${isNot ? 'not.' : ''}toContain(${JSON.stringify(item)}) failed`);
    },
    toThrow() {
      let threw = false;
      if (typeof actual === 'function') {
        try {
          actual();
        } catch (_err) {
          threw = true;
        }
      }
      check(threw, `expect(fn).${isNot ? 'not.' : ''}toThrow() failed: function did not throw`);
    },
    get not() {
      return createMatcher(actual, !isNot);
    }
  };

  return matchers;
}

export function expect(actual: any): ExpectMatcher {
  return createMatcher(actual, false);
}
