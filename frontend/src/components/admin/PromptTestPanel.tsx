import { useState } from 'react';
import { Play, Clock, Coins, AlertCircle, CheckCircle } from 'lucide-react';
import { AIPromptsService } from '../../services/ai-prompts.service';
import { PromptKey, PromptTestResult } from '../../types/ai-prompts';

interface PromptTestPanelProps {
  promptKey: PromptKey;
  systemPrompt: string;
}

// Default test data for each prompt type
const DEFAULT_TEST_DATA: Record<PromptKey, Record<string, unknown>> = {
  speech_analysis: {
    transcript:
      'Hello everyone. Today I will show you how to reset your password. First, click on the forgot password link on the login page. Then enter your email address and click submit. You will receive an email with a reset link.',
    rubricSteps: [
      {
        id: 'step-1',
        title: 'Greeting',
        requiredKeywords: ['hello', 'hi', 'welcome'],
        requiredPhrases: ['introduce yourself or the topic'],
      },
      {
        id: 'step-2',
        title: 'Explain Password Reset',
        requiredKeywords: ['password', 'reset', 'forgot', 'link'],
        requiredPhrases: ['explain how to access password reset'],
      },
    ],
  },
  visual_analysis: {
    frameDescriptions: [
      'Login page with username and password fields, forgot password link visible in bottom left',
      'Password reset form with email input field and blue submit button',
      'Success message showing "Password reset email sent" with green checkmark icon',
    ],
    expectedElements: [
      'login page',
      'forgot password link',
      'email input',
      'submit button',
      'success message',
    ],
  },
  rubric_generation: {
    sampleTranscript:
      'Welcome to this tutorial on creating a new user account. Step one: click the Sign Up button in the top right corner. Step two: fill in your name, email address, and create a strong password. Make sure your password has at least 8 characters. Step three: click Create Account and then verify your email by clicking the link we send you.',
    frameCount: 4,
    taskType: 'Software Tutorial',
  },
};

export default function PromptTestPanel({ promptKey, systemPrompt }: PromptTestPanelProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<PromptTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testData, setTestData] = useState<string>(
    JSON.stringify(DEFAULT_TEST_DATA[promptKey], null, 2)
  );
  const [showTestData, setShowTestData] = useState(false);

  const handleTest = async () => {
    if (!systemPrompt.trim()) {
      setError('Please enter a system prompt to test');
      return;
    }

    try {
      setTesting(true);
      setError(null);
      setResult(null);

      let parsedTestData: Record<string, unknown>;
      try {
        parsedTestData = JSON.parse(testData);
      } catch {
        setError('Invalid test data JSON');
        return;
      }

      const testResult = await AIPromptsService.testPrompt(promptKey, systemPrompt, parsedTestData);
      setResult(testResult);
    } catch (err: any) {
      // Handle rate limit error specially
      if (err.response?.status === 429) {
        setError('Rate limited. Please wait 10 seconds between tests to prevent API cost abuse.');
      } else {
        setError(err.response?.data?.error || err.message || 'Test failed');
      }
    } finally {
      setTesting(false);
    }
  };

  const resetTestData = () => {
    setTestData(JSON.stringify(DEFAULT_TEST_DATA[promptKey], null, 2));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Play className="h-5 w-5 text-gray-500" />
        Test Prompt
      </h3>

      <p className="text-sm text-gray-500 mb-4">
        Test your prompt changes with sample data before saving. This sends a request to Gemini AI.
      </p>

      {/* Test Data Editor */}
      <div className="mb-4">
        <button
          onClick={() => setShowTestData(!showTestData)}
          className="text-sm text-blue-600 hover:text-blue-800 mb-2"
        >
          {showTestData ? 'Hide' : 'Show'} test data
        </button>

        {showTestData && (
          <div className="mt-2">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-gray-500">Test Data (JSON)</label>
              <button
                onClick={resetTestData}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Reset to default
              </button>
            </div>
            <textarea
              value={testData}
              onChange={(e) => setTestData(e.target.value)}
              className="w-full h-40 p-2 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Test Button */}
      <button
        onClick={handleTest}
        disabled={testing || !systemPrompt.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testing ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Testing with Gemini...
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Run Test
          </>
        )}
      </button>

      <p className="text-xs text-gray-400 mt-2 text-center">
        Rate limited to 1 test per 10 seconds
      </p>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 space-y-3">
          {/* Status */}
          <div
            className={`p-3 rounded-lg ${
              result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-green-800">Test Successful</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <span className="font-medium text-red-800">Test Failed</span>
                </>
              )}
            </div>
            {result.error && <p className="text-sm text-red-700 mt-1">{result.error}</p>}
          </div>

          {/* Metrics */}
          {result.success && (
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1 text-gray-600">
                <Clock className="h-4 w-4" />
                {result.processingTimeMs}ms
              </div>
              {result.tokenCount && (
                <div className="flex items-center gap-1 text-gray-600">
                  <Coins className="h-4 w-4" />
                  {result.tokenCount.total.toLocaleString()} tokens
                  <span className="text-xs text-gray-400">
                    ({result.tokenCount.input} in / {result.tokenCount.output} out)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Response Preview */}
          {result.success && result.response && (
            <div>
              <label className="text-xs font-medium text-gray-500">AI Response:</label>
              <pre className="mt-1 p-3 bg-gray-100 rounded-lg text-xs font-mono text-gray-700 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                {result.response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
