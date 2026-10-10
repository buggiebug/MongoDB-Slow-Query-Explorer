# QueryLens — [MongoDB Slow Query Explorer](https://buggiebug.github.io/MongoDB-Slow-Query-Explorer)

A small, dependency-free browser app for reading MongoDB slow-query logs clearly. Import `.log`, `.txt`, `.json`, and `.jsonl` files to find slow-query events and inspect commands, execution statistics, and query plans.

## Features

- Reads MongoDB JSON-per-line logs, including shell-prefixed JSON events.
- Skips unrelated log events and reports malformed lines.
- Ranks queries by duration, documents examined, or timestamp.
- Filters by operation, query plan, database, collection, command text, or source file.
- Shows collection scans, index usage, command JSON, raw log events, and execution metrics.
- Keeps the selected-query details panel visible while scrolling the query list on desktop; on narrow screens, details appear below the list.
- Copies a cleaned query command to the clipboard.
- Processes imported files locally in your browser; log files are not uploaded to a server.

## Getting Started

Follow these steps to collect MongoDB slow-query logs and analyze them with QueryLens.

### Step 1: Identify your MongoDB deployment

Choose the instructions that match your setup:

- **Self-hosted MongoDB:** Continue to Step 2 to configure slow-operation logging.
- **MongoDB Atlas:** Use Atlas Query Profiler or download the deployment's diagnostic logs if available. Some Atlas cluster tiers do not support the database profiling commands shown below.

### Step 2: Enable slow-operation logging

For a self-hosted MongoDB deployment, connect to the database using `mongosh`:

```bash
mongosh "mongodb://localhost:27017"
```

Replace the connection string with your own MongoDB connection string if necessary.

In the MongoDB shell, run:

```javascript
db.setProfilingLevel(0, {
  slowms: 100,
  sampleRate: 1.0
});
```

This configures the slow-operation threshold to 100 milliseconds and the sampling rate to 100%, while keeping the database profiler disabled. MongoDB can still write qualifying slow operations to its diagnostic log.

**Important:** The `slowms` threshold is applied at the MongoDB process level. Choose a threshold appropriate for your workload, and be careful when changing logging settings on production systems.

To verify the current settings, run:

```javascript
db.getProfilingStatus();
```

Look for the `slowms` and `sampleRate` values in the output.

> **Note:** This command changes runtime settings, which may revert after a MongoDB restart. The command is also unsupported on some Atlas tiers, including M0 and Flex. Consult the [MongoDB profiling documentation](https://www.mongodb.com/docs/manual/reference/method/db.setProfilingLevel/) for deployment-specific details.

### Step 3: Generate some slow-query events

Execute normal application queries against your database, or reproduce a query that takes longer than your configured threshold.

For example, you can run a query against a collection in a test database:

```javascript
use myDatabase;

db.myCollection.find({
  status: "active"
}).sort({
  createdAt: -1
}).toArray();
```

Replace `myDatabase` and `myCollection` with your database and collection names.

If the operation qualifies as slow, MongoDB can record it in the diagnostic log. The example query is only for demonstration; whether it appears depends on its execution time and your logging configuration.

### Step 4: Locate and obtain the MongoDB log file

For self-hosted MongoDB, find the diagnostic log path in your MongoDB configuration file. Look for a setting similar to:

```yaml
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
```

The actual path varies by operating system and installation. If MongoDB writes logs to standard output instead of a file, collect the output using your service manager or container logging system.

Copy or export the relevant diagnostic log file to a location you can access from your browser.

For MongoDB Atlas, open your deployment's monitoring or log-management tools and obtain the relevant diagnostic logs, where supported. Alternatively, use Atlas Query Profiler to identify slow operations.

**Tip:** MongoDB diagnostic logs may contain sensitive query values, database names, collection names, or other operational information. Review and redact sensitive data before sharing log files.

### Step 5: Open QueryLens

Open the hosted application:

**[Launch QueryLens](https://buggiebug.github.io/MongoDB-Slow-Query-Explorer/)**

Alternatively, clone or download this repository and open `index.html` in a modern browser.

No backend server or additional dependencies are required.

### Step 6: Import your log files

1. Click the file upload area in QueryLens.
2. Select your MongoDB `.log`, `.txt`, `.json`, or `.jsonl` file.
3. You can also drag and drop log files onto the upload area.
4. Wait for the app to parse the logs and display the detected slow-query events.

You can import multiple log files to compare events from different sources.

**Important:** Import MongoDB diagnostic logs in their original format. QueryLens is designed to parse MongoDB log events, including JSON-per-line logs and shell-prefixed JSON events. Exporting documents from `system.profile` as arbitrary JSON is not necessarily equivalent to importing a diagnostic log file.

### Step 7: Explore the slow-query list

Once your logs are loaded, use the query list to find operations that deserve investigation.

You can:

- Sort queries by execution duration, documents examined, or timestamp.
- Filter by operation type, query plan, database, collection, command text, or source file.
- Select a query to view its detailed information.
- Inspect execution statistics and the query plan to understand how MongoDB executed the operation.

### Step 8: Investigate and optimize queries

Pay particular attention to these indicators:

| Indicator | What to look for |
| --- | --- |
| Execution duration | Queries that take unusually long to complete. |
| Documents examined | A high number of documents scanned relative to the number returned. |
| Query plan | `COLLSCAN` may indicate a collection scan; investigate whether a suitable index could help. |
| Index usage | Check whether the query uses an appropriate index. |
| Documents returned | Compare the result count with the number of documents examined. |

For example, a query that examines thousands of documents but returns only a few may benefit from a suitable index or a more selective query filter. However, the correct optimization depends on the query, available indexes, data distribution, and execution plan.

QueryLens helps you inspect the evidence; validate proposed changes against your workload before applying them.

### Step 9: Copy the query command

Select a query and use the copy action to copy its cleaned command to the clipboard.

You can use the copied command as a starting point for further investigation in `mongosh` or your application code. Review the command and its parameters before executing it.

## Run Locally

1. Clone or download the repository.
2. Open `index.html` in a modern browser.
3. Import one or more MongoDB log files or drop them onto the upload area.

```bash
git clone https://github.com/buggiebug/MongoDB-Slow-Query-Explorer.git
cd MongoDB-Slow-Query-Explorer
```

Open `index.html` directly in your browser. No build step or package installation is required.

## Privacy

QueryLens reads imported files locally in the browser. Your log files are not uploaded to a server by the application.

Still, MongoDB logs can contain sensitive information. Handle them according to your organization's security and data-handling policies.

## Resources

- [Launch QueryLens](https://buggiebug.github.io/MongoDB-Slow-Query-Explorer/)
- [GitHub Repository](https://github.com/buggiebug/MongoDB-Slow-Query-Explorer)
- [MongoDB Database Profiler Documentation](https://www.mongodb.com/docs/manual/tutorial/manage-the-database-profiler/)
- [MongoDB `db.setProfilingLevel()` Documentation](https://www.mongodb.com/docs/manual/reference/method/db.setProfilingLevel/)



## 👨‍💻 Author

**Shubham Mishra**

---

<div align="center">

Built with ❤️

**⭐ Star this repo if you found it useful!**

</div>
