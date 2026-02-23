# Real-World Examples

Practical examples of using Gemini MCP Tool in development workflows.

## Code Review

### Reviewing a Pull Request
```
ask gemini to review these changes in @feature/new-api/*.js for:
- Security issues
- Performance concerns  
- Code style consistency
- Missing error handling
```

### Pre-commit Check
```
"Gemini, check my staged changes before I commit"
```

## Debugging

### Analyzing Error Logs
```
ask gemini to explain why am I getting "undefined is not a function" errors in @logs/error.log and @src/api/handler.js
```

### Stack Trace Analysis
```
@crash-report.txt gemini, what caused this crash and how do I fix it?
```

## Architecture Analysis

### Understanding a New Codebase
```
ask gemini to give me an overview of this project's architecture based on @package.json @src/**/*.js @README.md
```

### Dependency Analysis
```
@package.json @package-lock.json are there any security vulnerabilities or outdated packages?
```

## Documentation

### Generating API Docs
```
ask gemini to generate OpenAPI documentation for these endpoints in @routes/api/*.js
```

### README Creation
```
@src/**/*.js @package.json create a comprehensive README for this project
```

## Testing

### Writing Tests
```
ask gemini to write comprehensive Jest tests for this module in @src/utils/validator.js
```

### Test Coverage Analysis
```
@src/**/*.js @test/**/*.test.js what's not being tested?
```

## Refactoring

### Code Optimization
```
ask gemini how I can optimize this slow function in @src/data-processor.js
```

### Pattern Implementation
```
@src/services/*.js refactor these to use the Repository pattern
```

## Learning

### Understanding Concepts
```
ask gemini in sandbox mode to show me how OAuth 2.0 works with a working example
```

### Best Practices
```
@src/auth/*.js does this follow security best practices?
```

## Migration

### Framework Upgrade
```
ask gemini what changes are needed to upgrade from Express 4 to Express 5 based on @package.json @src/**/*.js
```

### Language Migration
```
@legacy/script.js convert this to TypeScript with proper types
```

## Security Audit

### Vulnerability Scan
```
ask gemini to perform a security audit and identify potential vulnerabilities in @src/**/*.js @package.json
```

### OWASP Check
```
@src/api/**/*.js check for OWASP Top 10 vulnerabilities
```

## Performance Analysis

### Bottleneck Detection
```
ask gemini to identify performance bottlenecks in the request pipeline in @src/routes/*.js @src/middleware/*.js
```

### Memory Leaks
```
@src/**/*.js look for potential memory leaks or inefficient patterns
```

## Real Project Example

### Full Stack Review
```bash
# 1. Architecture overview
ask gemini to explain how the frontend and backend connect based on @package.json @src/index.js @client/App.jsx 

# 2. API Security
ask gemini to review API security implementation in @routes/api/*.js @middleware/auth.js 

# 3. Database optimization
ask gemini to suggest database optimizations in @models/*.js @db/queries/*.sql 

# 4. Frontend performance
ask gemini how can I improve frontend performance in @client/**/*.jsx @client/**/*.css 

# 5. Test coverage
ask gemini what critical paths lack test coverage in @src/**/*.js @test/**/*.test.js 
```

## Tips for Effective Usage

1. **Start Broad, Then Narrow**: Begin with overview, then dive into specifics
2. **Combine Related Files**: Include configs with source code
3. **Ask Follow-up Questions**: Build on previous responses
4. **Use Specific Criteria**: Tell Gemini what to look for
5. **Iterate on Solutions**: Refine based on suggestions