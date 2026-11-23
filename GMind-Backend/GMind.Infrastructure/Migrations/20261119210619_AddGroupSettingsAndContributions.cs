using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GMind.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupSettingsAndContributions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ContributionCredits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Points = table.Column<int>(type: "int", nullable: false),
                    CreditedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContributionCredits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContributionCredits_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ContributionCredits_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ContributionCredits_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ContributionCredits_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GroupSettings",
                columns: table => new
                {
                    GroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RiskHoursBeforeDeadline = table.Column<int>(type: "int", nullable: false),
                    RiskProgressBelowPercent = table.Column<int>(type: "int", nullable: false),
                    StaleAfterHours = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupSettings", x => x.GroupId);
                    table.ForeignKey(
                        name: "FK_GroupSettings_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupSettings_Users_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ContributionCredits_GroupId",
                table: "ContributionCredits",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_ContributionCredits_ProjectId_UserId",
                table: "ContributionCredits",
                columns: new[] { "ProjectId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ContributionCredits_TaskId",
                table: "ContributionCredits",
                column: "TaskId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ContributionCredits_UserId",
                table: "ContributionCredits",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupSettings_UpdatedByUserId",
                table: "GroupSettings",
                column: "UpdatedByUserId");

            // One-time backfill: credit the assignee of every already-approved top-level task
            // that has points and no credit yet. Idempotent via the NOT EXISTS guard.
            migrationBuilder.Sql("""
                INSERT INTO ContributionCredits (Id, TaskId, ProjectId, GroupId, UserId, Points, CreditedAt)
                SELECT NEWID(), t.Id, t.ProjectId, p.GroupId, t.AssigneeUserId, t.Points,
                       COALESCE(t.CompletedAt, t.UpdatedAt)
                FROM Tasks t
                INNER JOIN Projects p ON p.Id = t.ProjectId
                WHERE t.ParentTaskId IS NULL
                  AND t.Status = 5
                  AND t.Points IS NOT NULL
                  AND t.AssigneeUserId IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM ContributionCredits c WHERE c.TaskId = t.Id)
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContributionCredits");

            migrationBuilder.DropTable(
                name: "GroupSettings");
        }
    }
}
