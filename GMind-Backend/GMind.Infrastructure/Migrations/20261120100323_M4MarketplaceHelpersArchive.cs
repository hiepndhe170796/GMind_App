using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GMind.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class M4MarketplaceHelpersArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ClaimedAt",
                table: "MarketplaceRequests",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HelpScope",
                table: "MarketplaceRequests",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecipientComment",
                table: "MarketplaceRequests",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RespondedAt",
                table: "MarketplaceRequests",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ArchivedAt",
                table: "Groups",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ArchivedByUserId",
                table: "Groups",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Label",
                table: "GroupInvites",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TaskHelpers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HelperUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MarketplaceRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Scope = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    EndedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskHelpers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskHelpers_MarketplaceRequests_MarketplaceRequestId",
                        column: x => x.MarketplaceRequestId,
                        principalTable: "MarketplaceRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskHelpers_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskHelpers_Users_EndedByUserId",
                        column: x => x.EndedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskHelpers_Users_HelperUserId",
                        column: x => x.HelperUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Groups_ArchivedByUserId",
                table: "Groups",
                column: "ArchivedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskHelpers_EndedByUserId",
                table: "TaskHelpers",
                column: "EndedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskHelpers_HelperUserId",
                table: "TaskHelpers",
                column: "HelperUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskHelpers_MarketplaceRequestId",
                table: "TaskHelpers",
                column: "MarketplaceRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskHelpers_TaskId_HelperUserId",
                table: "TaskHelpers",
                columns: new[] { "TaskId", "HelperUserId" },
                unique: true,
                filter: "[EndedAt] IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Groups_Users_ArchivedByUserId",
                table: "Groups",
                column: "ArchivedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Legacy invites created before token hashing kept a plaintext Code. Scrub it —
            // rows where Code IS NOT NULL AND TokenHash = '' are impossible to recover and are
            // blocked by the pre-check (see milestone notes). Down cannot restore the codes.
            migrationBuilder.Sql(
                "UPDATE GroupInvites SET Code = NULL WHERE Code IS NOT NULL AND TokenHash <> ''");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Groups_Users_ArchivedByUserId",
                table: "Groups");

            migrationBuilder.DropTable(
                name: "TaskHelpers");

            migrationBuilder.DropIndex(
                name: "IX_Groups_ArchivedByUserId",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "ClaimedAt",
                table: "MarketplaceRequests");

            migrationBuilder.DropColumn(
                name: "HelpScope",
                table: "MarketplaceRequests");

            migrationBuilder.DropColumn(
                name: "RecipientComment",
                table: "MarketplaceRequests");

            migrationBuilder.DropColumn(
                name: "RespondedAt",
                table: "MarketplaceRequests");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "ArchivedByUserId",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "Label",
                table: "GroupInvites");
        }
    }
}
